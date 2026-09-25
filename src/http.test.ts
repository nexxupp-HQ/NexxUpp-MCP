import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import type { AddressInfo, Server } from "node:net";
import { serveHttp } from "./http-server.js";

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function rpcFrame(id: number, method: string, params: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

async function readFrame(
  stdout: NodeJS.ReadableStream,
  id: number,
  timeoutMs = 15000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for frame ${id}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      stdout.off("data", onData);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      for (const line of buffer.split("\n")) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line) as { id?: number };
          if (frame.id === id) {
            cleanup();
            resolve(frame as Record<string, unknown>);
            return;
          }
        } catch {
          // partial line; keep buffering
        }
      }
    };
    stdout.on("data", onData);
  });
}

describe("stdio transport", () => {
  let child: ChildProcess;
  before(() => {
    child = spawn(process.execPath, ["dist/index.js"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  });
  after(() => {
    child.kill("SIGKILL");
  });

  it("lists all 22 tools", async () => {
    child.stdin!.write(
      rpcFrame(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      })
    );
    await readFrame(child.stdout!, 1);
    child.stdin!.write(rpcFrame(2, "tools/list", {}));
    const list = await readFrame(child.stdout!, 2);
    const tools = (list.result as { tools: { name: string }[] }).tools;
    assert.equal(tools.length, 22);
    const names = new Set(tools.map((t) => t.name));
    for (const expected of [
      "billing_usage",
      "cortex_memory_store",
      "cortex_memory_search",
      "cortex_turn",
      "nws_search",
      "nws_station_assist",
      "nws_list_stations",
      "calendar_list_calendars",
      "calendar_ai_assist",
    ]) {
      assert.ok(names.has(expected), `missing tool ${expected}`);
    }
  });
});

describe("http transport (hosted auth gate)", () => {
  let server: Server;
  let base = "";

  before(async () => {
    server = await serveHttp(0, "127.0.0.1");
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(
    body: unknown,
    token?: string
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        ...HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    // Success rides SSE framing; auth/parse errors are plain JSON.
    const dataLine = text
      .split("\n")
      .find((l) => l.startsWith("data: "))
      ?.slice("data: ".length);
    return { status: res.status, json: JSON.parse(dataLine ?? text) };
  }

  it("health is open", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });

  it("unknown paths 404", async () => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });

  it("rejects requests without a token", async () => {
    const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    assert.equal(status, 401);
    assert.equal(
      (json as { error: { code: number } }).error.code,
      -32001
    );
  });

  it("rejects invalid tokens without touching tools", async () => {
    const { status } = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      "definitely-not-a-token"
    );
    assert.equal(status, 401);
  });

  it("serves discovery docs when the backend is up", async () => {
    const prm = await fetch(`${base}/.well-known/oauth-protected-resource`);
    const asm = await fetch(`${base}/.well-known/oauth-authorization-server`);
    // Backend may be down in CI: then both must 503, never 200 with junk.
    if (prm.status === 200) {
      const doc = (await prm.json()) as { resource: string; authorization_servers: string[] };
      assert.ok(doc.resource);
      assert.ok(doc.authorization_servers.length > 0);
      assert.equal(asm.status, 200);
    } else {
      assert.equal(prm.status, 503);
      assert.equal(asm.status, 503);
    }
  });
});
