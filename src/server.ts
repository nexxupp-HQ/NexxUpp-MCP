import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBillingTools } from "./tools/billing.js";
import { registerCortexTools } from "./tools/cortex.js";
import { registerNwsTools } from "./tools/nws.js";
import { registerCalendarTools } from "./tools/calendar.js";

// Fresh instance per transport. Cheap (no I/O) and required:
// one server must not be shared across HTTP requests.
export function createNexxuppServer(): McpServer {
  const server = new McpServer({ name: "nexxupp", version: "0.1.0" });
  registerCortexTools(server);
  registerNwsTools(server);
  registerCalendarTools(server);
  registerBillingTools(server);
  return server;
}
