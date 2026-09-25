import { z } from "zod";
import { get } from "../http.js";
import { defineTool, ok, type Agendum } from "../tooling.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function fail(err: unknown): Agendum {
  const text =
    err instanceof Error ? `billing request failed: ${err.message}` : "billing request failed";
  return { content: [{ type: "text", text }] };
}

type Usage = {
  balance?: number;
  balance_milli?: number;
  tier?: string;
  billing_status?: string;
  turns_today?: number;
  turns_all_time?: number;
  storage_bytes_used?: number;
  storage_quota_bytes?: number;
  spend_by_product?: unknown;
};

// Read-only budget envelope. Agents MUST consult this before starting an
// expensive run: every tool call below spends the caller's wallet credits.
// No purchase/checkout tool exists here on purpose — money-out actions stay
// in the human UI (see Agent.md: irreversible and money-moving surface).
export function registerBillingTools(server: McpServer): void {
  defineTool(
    server,
    "billing_usage",
    "Check the caller's wallet before expensive runs: credit balance, tier, storage used vs quota, turns used, spend by product. Read-only; it never spends.",
    {},
    async () => {
      try {
        const u = (await get("/me/usage")) as Usage;
        return ok({
          balance_credits: u.balance,
          balance_milli: u.balance_milli,
          tier: u.tier,
          billing_status: u.billing_status,
          turns_today: u.turns_today,
          turns_all_time: u.turns_all_time,
          storage: {
            bytes_used: u.storage_bytes_used,
            quota_bytes: u.storage_quota_bytes,
          },
          spend_by_product: u.spend_by_product,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

export const BILLING_TOOL_NAMES = ["billing_usage"] as const;
