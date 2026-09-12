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

// Matches the fail() text convention in tools/*.ts.
const FAIL_RE = /^(cortex|nws|calendar) request failed/;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): void {
  const register = server.tool as unknown as (
    name: string,
    description: string,
    shape: ZodRawShape,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
