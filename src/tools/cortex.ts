import { z } from "zod";
import { CORTEX_API_KEY, CORTEX_API_URL, UPSTREAM_TIMEOUT_MS } from "../config.js";
import { ApiError } from "../http.js";
import { defineTool } from "../tooling.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Agendum = { content: { type: "text"; text: string }[] };

function ok(value: unknown): Agendum {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown): Agendum {
  const text =
    err instanceof ApiError
      ? `cortex request failed (${err.status}): ${err.body}`
      : err instanceof Error
        ? `cortex request failed: ${err.message}`
        : "cortex request failed";
  return { content: [{ type: "text", text }] };
}

async function cortex<T>(path: string, init: RequestInit = {}, apiKey?: string): Promise<T> {
  const key = apiKey || CORTEX_API_KEY;
  if (!key) {
    throw new Error("CORTEX_API_KEY is not set (pass apiKey on shared servers)");
  }
  const res = await fetch(`${CORTEX_API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text(), path);
  }
  return (await res.json()) as T;
}

const API_KEY_FIELD = {
  apiKey: z
    .string()
    .optional()
    .describe("Your Cortex tenant key. Required on shared/hosted servers; else the server key is used."),
};

export function registerCortexTools(server: McpServer): void {
  defineTool(server, 
    "cortex_memory_store",
    "Store one user memory in Cortex. Returns the versioned brick. Scope every call to the end user's id.",
    {
      userId: z.string().describe("End user id the memory belongs to"),
      message: z.string().describe("The fact, preference, or turn to remember"),
      sessionId: z.string().optional().describe("Session scope, if any"),
      domain: z.string().optional().describe("Memory domain, if any"),
      ...API_KEY_FIELD,
    },
    async ({ userId, message, sessionId, domain, apiKey }) => {
      try {
        return ok(
          await cortex(
            "/v1/messages",
            {
              method: "POST",
              body: JSON.stringify({
                user_id: userId,
                message,
                ...(sessionId ? { session_id: sessionId } : {}),
                ...(domain ? { domain } : {}),
              }),
            },
            apiKey
          )
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "cortex_memory_search",
    "Hybrid recall over a user's Cortex memory. Returns ranked, cited bricks.",
    {
      userId: z.string().describe("End user id to recall for"),
      query: z.string().describe("Natural-language recall query"),
      topK: z.number().int().min(1).max(20).optional().describe("Max bricks (default 5)"),
      minScore: z.number().min(0).max(1).optional().describe("Min score (default 0.25)"),
      ...API_KEY_FIELD,
    },
    async ({ userId, query, topK, minScore, apiKey }) => {
      try {
        const params = new URLSearchParams({ user_id: userId, query });
        if (topK !== undefined) params.set("top_k", String(topK));
        if (minScore !== undefined) params.set("min_score", String(minScore));
        return ok(await cortex(`/v1/messages/search?${params.toString()}`, {}, apiKey));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "cortex_turn",
    "Stateful Cortex turn over a session. Use for multi-step flows that must stay coherent.",
    {
      userId: z.string().describe("End user id"),
      message: z.string().describe("The user turn"),
      sessionId: z.string().optional().describe("Session to continue"),
      systemPrompt: z.string().optional().describe("System prompt override"),
      ...API_KEY_FIELD,
    },
    async ({ userId, message, sessionId, systemPrompt, apiKey }) => {
      try {
        return ok(
          await cortex(
            "/v1/turn",
            {
              method: "POST",
              body: JSON.stringify({
                user_id: userId,
                message,
                ...(sessionId ? { session_id: sessionId } : {}),
                ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
              }),
            },
            apiKey
          )
        );
      } catch (err) {
        return fail(err);
      }
    }
  );
}
