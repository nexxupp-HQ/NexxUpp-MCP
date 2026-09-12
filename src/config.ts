// Central env. No secrets are logged or persisted.

export const NEXXUPP_API_URL =
  process.env.NEXXUPP_API_URL ?? "http://localhost:8080";

export const CORTEX_API_URL =
  process.env.CORTEX_API_URL ?? "http://localhost:8081";

export const CORTEX_API_KEY = process.env.CORTEX_API_KEY ?? "";

// Preferred: session auth (auto-refresh). Fallback: static access token.
export const NEXXUPP_EMAIL = process.env.NEXXUPP_EMAIL ?? "";
export const NEXXUPP_PASSWORD = process.env.NEXXUPP_PASSWORD ?? "";
export const NEXXUPP_ACCESS_TOKEN = process.env.NEXXUPP_ACCESS_TOKEN ?? "";

// MCP_MODE=hosted: require per-request Bearer on HTTP, resolve the caller
// via /oauth/userinfo, scope every tool to them. Env session is disabled.
export const MCP_MODE = process.env.MCP_MODE === "hosted" ? "hosted" : "local";

// Public base URL of this MCP server, used in discovery docs.
export const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? "";

// Upstream deadline for backend/cortex calls (ms).
export const UPSTREAM_TIMEOUT_MS = Number(
  process.env.MCP_UPSTREAM_TIMEOUT_MS ?? "20000"
);

export function describeAuth(): string {
  const parts: string[] = [`api=${NEXXUPP_API_URL}`, `cortex=${CORTEX_API_URL}`];
  parts.push(`cortex_key=${CORTEX_API_KEY ? "set" : "MISSING"}`);
  parts.push(
    NEXXUPP_EMAIL && NEXXUPP_PASSWORD
      ? `nexxupp=session(${NEXXUPP_EMAIL})`
      : NEXXUPP_ACCESS_TOKEN
        ? "nexxupp=bearer(static)"
        : "nexxupp=MISSING"
  );
  return parts.join(" ");
}
