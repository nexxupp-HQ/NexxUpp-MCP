import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { checkRateLimit, resetRateLimits } from "./http-server.js";
import { createNexxuppServer } from "./server.js";

// Public tool surface, exact snapshot. Adding a tool here is a product
// decision (agent hands), not a side effect — update this list deliberately.
// In particular these families must NEVER appear as tools: admin, billing
// money-out (checkout/top-up/subscribe), auth credentials, deletes/purges,
// webhooks, exports.
const EXPECTED_TOOLS = [
  "billing_usage",
  "calendar_ai_assist",
  "calendar_create_event",
  "calendar_delete_event",
  "calendar_list_calendars",
  "calendar_list_events",
  "calendar_update_event",
  "cortex_memory_search",
  "cortex_memory_store",
  "cortex_turn",
  "nws_apply_template_blocks",
  "nws_create_chart",
  "nws_create_task",
  "nws_list_stations",
  "nws_open_page_for_event",
  "nws_read_database",
  "nws_search",
  "nws_search_blocks",
  "nws_station_assist",
  "nws_summarize_database",
  "nws_summarize_station",
  "nws_upsert_rows",
];

const FORBIDDEN_RE = /admin|checkout|top.?up|subscri|password|mfa|totp|purge|webhook|export-all|deletion/i;

async function listToolNames(): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createNexxuppServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "audit", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

describe("public tool surface", () => {
  it("matches the approved snapshot exactly", async () => {
    assert.deepEqual(await listToolNames(), EXPECTED_TOOLS);
  });

  it("contains no admin, money-out, credential, or destructive tools", async () => {
    for (const name of await listToolNames()) {
      assert.doesNotMatch(name, FORBIDDEN_RE, `forbidden tool family: ${name}`);
    }
  });
});

describe("per-caller rate limit", () => {
  it("allows a burst, then 429s until the window passes", () => {
    resetRateLimits();
    // Defaults are 120/min; exhaust them with fast in-memory checks.
    for (let i = 0; i < 120; i++) {
      assert.equal(checkRateLimit("audit-user").limited, false);
    }
    const blocked = checkRateLimit("audit-user");
    assert.equal(blocked.limited, true);
    assert.ok(blocked.retryAfterMs > 0);
    // Other callers are unaffected.
    assert.equal(checkRateLimit("other-user").limited, false);
    resetRateLimits();
  });
});
