#!/usr/bin/env node
// nexxupp-mcp: one MCP server for Cortex, NWS, and Calendar.
// Transports: stdio (default) or Streamable HTTP (--transport http).
// HTTP is stateless. Hosted mode requires per-request Bearer (see README).

import type { Server } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describeAuth } from "./config.js";
import { log } from "./logger.js";
import { createNexxuppServer } from "./server.js";
import { serveHttp } from "./http-server.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const transport = arg("--transport") ?? process.env.MCP_TRANSPORT ?? "stdio";

  if (transport === "http") {
    const port = Number(arg("--port") ?? process.env.MCP_PORT ?? "3100");
    const host = arg("--host") ?? process.env.MCP_HOST ?? "127.0.0.1";
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`invalid port: ${port}`);
    }
    const http: Server = await serveHttp(port, host);
    const shutdown = (signal: string) => {
      log.info("shutting down", { signal });
      http.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    log.info("up", { auth: describeAuth() });
    return;
  }

  if (transport !== "stdio") {
    throw new Error(`unknown transport: ${transport} (want stdio|http)`);
  }
  await createNexxuppServer().connect(new StdioServerTransport());
  log.info("up", { auth: describeAuth() });
}

main().catch((err: unknown) => {
  log.error("failed to start", { error: String(err) });
  process.exit(1);
});
