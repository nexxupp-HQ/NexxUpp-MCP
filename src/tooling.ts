import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  UnknownKeysParam,
  ZodRawShape,
  ZodTypeAny,
  objectOutputType,
} from "zod";
import { recordToolCall } from "./metrics.js";

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[] };

// Shared result shape + success envelope (was copy-pasted in tools/*.ts).
// Per-tool fail() stays local: prefixes differ ("cortex|nws|calendar …")
// and tooling.FAIL_RE depends on the exact text.
export type Agendum = ToolResult;

export function ok(value: unknown): Agendum {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

// Matches the fail() text convention in tools/*.ts.
const FAIL_RE = /^(cortex|nws|calendar|billing) request failed/;

// Registers a tool and counts calls + upstream failures for /metrics.
// Args are inferred from the zod shape, so handlers stay fully typed.
export function defineTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Shape,
  handler: (
    args: objectOutputType<Shape, ZodTypeAny, UnknownKeysParam>
  ) => Promise<ToolResult>
): void {
  const register = server.tool as unknown as (
    name: string,
    description: string,
    shape: ZodRawShape,
    handler: (args: any) => Promise<ToolResult>
  ) => void;
  register.call(server, name, description, shape, async (args) => {
    const result = await handler(args);
    recordToolCall(
      name,
      result.content.some((c) => FAIL_RE.test(c.text))
    );
    return result;
  });
}
