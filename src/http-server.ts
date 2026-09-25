import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MCP_MODE, MCP_PUBLIC_URL, NEXXUPP_API_URL } from "./config.js";
import { log } from "./logger.js";
import { metrics, snapshot } from "./metrics.js";
import { runWithCaller, type Caller } from "./request-context.js";
import { createNexxuppServer } from "./server.js";

const MCP_PATH = "/mcp";
const HOSTED = MCP_MODE === "hosted";
const MAX_BODY_BYTES = Number(process.env.MCP_MAX_BODY_BYTES ?? "1048576");
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_REQUEST_TIMEOUT_MS ?? "60000");
// Per-caller tool-call quota: MCP_RATE_LIMIT_MAX requests per
// MCP_RATE_LIMIT_WINDOW_MS (defaults 120/min). Keyed by user id in hosted
// mode, by socket IP otherwise. Tool calls spend wallet credits upstream,
// so an agent loop without a cap can drain a wallet in minutes.
const RATE_LIMIT_MAX = Number(process.env.MCP_RATE_LIMIT_MAX ?? "120");
const RATE_LIMIT_WINDOW_MS = Number(
  process.env.MCP_RATE_LIMIT_WINDOW_MS ?? "60000"
);

// Sliding-window hits per key. Bounded: idle keys are swept once the map
// grows past the cap (single instance; a fleet would need Redis).
const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(key: string): {
  limited: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, hits);
    return { limited: true, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - hits[0]) };
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 20000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || now - v[v.length - 1] > RATE_LIMIT_WINDOW_MS) {
        rateBuckets.delete(k);
      }
      if (rateBuckets.size <= 10000) break;
    }
  }
  return { limited: false, retryAfterMs: 0 };
}

// Test + ops helper (also lets a restart clear state honestly).
export function resetRateLimits(): void {
  rateBuckets.clear();
}

let oauthMetadata: unknown | null = null;

export function parseBearerHeader(
  value: string | string[] | undefined
): string | undefined {
  if (typeof value !== "string") return undefined;
  const [scheme, token] = value.split(" ");
  return scheme === "Bearer" && token ? token : undefined;
}

async function loadOauthMetadata(): Promise<void> {
  try {
    const res = await fetch(`${NEXXUPP_API_URL}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) oauthMetadata = await res.json();
  } catch {
    oauthMetadata = null;
  }
  if (!oauthMetadata) {
    log.warn("backend openid-configuration unreachable; discovery docs will 503");
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES && !rejected) {
        rejected = true;
        reject(Object.assign(new Error("body too large"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

// Validate the caller's token against the backend and return their identity.
// Never trust a token without this round-trip.
async function resolveCaller(token: string): Promise<Caller | null> {
  try {
    const res = await fetch(`${NEXXUPP_API_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { sub?: string };
    if (!info.sub) return null;
    return { token, userId: info.sub };
  } catch {
    return null;
  }
}

export async function serveHttp(port: number, host: string): Promise<Server> {
  const publicBase = MCP_PUBLIC_URL || `http://${host}:${port}`;
  if (HOSTED) await loadOauthMetadata();

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const requestId = randomUUID().slice(0, 8);
    metrics.httpRequests += 1;
    const url = new URL(req.url ?? "/", "http://localhost");

    const finish = (status: number) => {
      if (status >= 500) metrics.httpErrors += 1;
      log.info("http", {
        id: requestId,
        method: req.method,
        path: url.pathname,
        status,
        ms: Date.now() - started,
      });
    };
    const originalEnd = res.end.bind(res);
    let logged = false;
    res.on("finish", () => {
      if (!logged) {
        logged = true;
        finish(res.statusCode);
      }
    });

    // Overall request deadline so a hung upstream cannot hold sockets forever.
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        json(res, 504, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "request timeout" },
        });
      }
      try {
        req.destroy();
      } catch {
        // already gone
      }
    }, REQUEST_TIMEOUT_MS);
    timer.unref();
    res.on("finish", () => clearTimeout(timer));

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { status: "ok", mode: MCP_MODE });
        return;
      }

      if (req.method === "GET" && url.pathname === "/ready") {
        let backend = false;
        try {
          const probe = await fetch(`${NEXXUPP_API_URL}/health`, {
            signal: AbortSignal.timeout(5000),
          });
          backend = probe.ok;
        } catch {
          backend = false;
        }
        json(res, backend ? 200 : 503, {
          status: backend ? "ready" : "degraded",
          backend: backend ? "up" : "down",
          mode: MCP_MODE,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/metrics") {
        json(res, 200, snapshot());
        return;
      }

      if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
        if (!oauthMetadata || typeof oauthMetadata !== "object" || !("issuer" in oauthMetadata)) {
          json(res, 503, { error: "authorization server metadata unavailable" });
          return;
        }
        json(res, 200, {
          resource: publicBase,
          authorization_servers: [(oauthMetadata as { issuer: string }).issuer],
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
        if (!oauthMetadata) {
          json(res, 503, { error: "authorization server metadata unavailable" });
          return;
        }
        json(res, 200, oauthMetadata);
        return;
      }

      if (url.pathname !== MCP_PATH || req.method !== "POST") {
        json(res, 404, { error: "use POST /mcp" });
        return;
      }

      let caller: Caller | undefined;
      if (HOSTED) {
        const token = parseBearerHeader(req.headers.authorization);
        if (!token) {
          metrics.authRejections += 1;
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${publicBase}/.well-known/oauth-protected-resource"`,
          });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32001, message: "missing bearer token" },
            })
          );
          return;
        }
        const resolved = await resolveCaller(token);
        if (!resolved) {
          metrics.authRejections += 1;
          json(res, 401, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "invalid or expired token" },
          });
          return;
        }
        caller = resolved;
        log.debug("caller resolved", { id: requestId, user: caller.userId.slice(0, 8) });
      }

      // Tool calls cost wallet credits upstream — cap agent loops per
      // caller (user id) or per socket IP. Health/metrics/discovery above
      // stay unlimited; only POST /mcp is gated.
      const rateKey = caller
        ? `user:${caller.userId}`
        : `ip:${req.socket.remoteAddress ?? "unknown"}`;
      const rl = checkRateLimit(rateKey);
      if (rl.limited) {
        metrics.rateLimited += 1;
        log.warn("rate limited", { id: requestId, key: caller ? "user" : "ip" });
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))),
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32000, message: "rate limit exceeded, slow down" },
          })
        );
        return;
      }

      let body: unknown;
      try {
        body = await readJson(req);
      } catch (err) {
        const code = (err as { code?: number }).code === 413 ? -32000 : -32700;
        const message = (err as { code?: number }).code === 413 ? "body too large" : "parse error";
        json(res, (err as { code?: number }).code === 413 ? 413 : 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code, message },
        });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless: no session affinity
      });
      res.on("close", () => {
        transport.close().catch(() => undefined);
      });
      const run = () =>
        createNexxuppServer()
          .connect(transport)
          .then(() => transport.handleRequest(req, res, body));
      if (caller) await runWithCaller(caller, run);
      else await run();
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      try {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: "internal error" },
          })
        );
      } catch {
        // socket already gone
      }
    }
  });

  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  log.info("listening", { url: `http://${host}:${port}${MCP_PATH}`, mode: MCP_MODE });
  return http;
}
