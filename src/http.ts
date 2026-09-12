// Minimal HTTP layer: cookie session with refresh for Nexxupp,
// static Bearer for Cortex. Throws ApiError on non-2xx.

import {
  MCP_MODE,
  NEXXUPP_ACCESS_TOKEN,
  NEXXUPP_API_URL,
  NEXXUPP_EMAIL,
  NEXXUPP_PASSWORD,
  UPSTREAM_TIMEOUT_MS,
} from "./config.js";
import { currentCaller } from "./request-context.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    url: string
  ) {
    super(`request failed (${status}) ${url}: ${body.slice(0, 300)}`);
    this.name = "ApiError";
  }
}

type HeaderMap = Record<string, string>;

function storeCookies(
  jar: Map<string, string>,
  res: Response
): void {
  const setCookies: string[] =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const header of setCookies) {
    const pair = header.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      return parsed.error ?? parsed.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return res.statusText;
  }
}

// Session auth against nexxupp-backend: login once, refresh on 401.
class NexxuppSession {
  private jar = new Map<string, string>();
  private loggedIn = false;
  private loginPromise: Promise<void> | null = null;

  private async login(): Promise<void> {
    if (!NEXXUPP_EMAIL || !NEXXUPP_PASSWORD) {
      throw new Error(
        "nexxupp auth missing: set NEXXUPP_EMAIL + NEXXUPP_PASSWORD, or NEXXUPP_ACCESS_TOKEN"
      );
    }
    const res = await fetch(`${NEXXUPP_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({
        login: NEXXUPP_EMAIL,
        password: NEXXUPP_PASSWORD,
      }),
    });
    storeCookies(this.jar, res);
    if (!res.ok) throw new ApiError(res.status, await readError(res), "/auth/login");
    this.loggedIn = true;
  }

  private async refresh(): Promise<void> {
    const res = await fetch(`${NEXXUPP_API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(this.jar),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: "{}",
    });
    storeCookies(this.jar, res);
    if (!res.ok) {
      this.loggedIn = false;
      await this.login();
      return;
    }
    this.loggedIn = true;
  }

  private ensureLogin(): Promise<void> {
    if (this.loggedIn) return Promise.resolve();
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  async headers(): Promise<HeaderMap> {
    if (NEXXUPP_ACCESS_TOKEN) {
      return { Authorization: `Bearer ${NEXXUPP_ACCESS_TOKEN}` };
    }
    await this.ensureLogin();
    return { Cookie: cookieHeader(this.jar) };
  }

  async onUnauthorized(): Promise<void> {
    if (NEXXUPP_ACCESS_TOKEN) return; // static token: nothing to rotate
    this.loggedIn = false;
    this.jar.clear();
    await this.refresh();
  }
}

const session = new NexxuppSession();

export async function nexxupp<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  // Hosted mode: act as the validated caller, never as the env session.
  if (MCP_MODE === "hosted") {
    const caller = currentCaller();
    if (!caller) throw new Error("hosted mode requires an authenticated caller");
    const res = await fetch(`${NEXXUPP_API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${caller.token}`,
        ...((init.headers as HeaderMap | undefined) ?? {}),
      },
    });
    if (!res.ok) throw new ApiError(res.status, await readError(res), path);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const headers: HeaderMap = {
    "Content-Type": "application/json",
    ...(await session.headers()),
    ...((init.headers as HeaderMap | undefined) ?? {}),
  };
  let res = await fetch(`${NEXXUPP_API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers,
  });
  if (res.status === 401 && !NEXXUPP_ACCESS_TOKEN) {
    await session.onUnauthorized();
    const retryHeaders: HeaderMap = {
      "Content-Type": "application/json",
      ...(await session.headers()),
      ...((init.headers as HeaderMap | undefined) ?? {}),
    };
    res = await fetch(`${NEXXUPP_API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: retryHeaders,
    });
  }
  if (!res.ok) throw new ApiError(res.status, await readError(res), path);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function get<T>(path: string): Promise<T> {
  return nexxupp<T>(path, { method: "GET" });
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return nexxupp<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return nexxupp<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function del<T>(path: string): Promise<T> {
  return nexxupp<T>(path, { method: "DELETE" });
}
