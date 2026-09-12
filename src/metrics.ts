// In-memory counters only. No PII, no user ids, no tokens.

export const metrics = {
  startedAt: Date.now(),
  httpRequests: 0,
  httpErrors: 0,
  mcpCalls: 0,
  mcpCallErrors: 0,
  authRejections: 0,
  perTool: new Map<string, number>(),
};

export function recordToolCall(name: string, failed: boolean): void {
  metrics.mcpCalls += 1;
  if (failed) metrics.mcpCallErrors += 1;
  metrics.perTool.set(name, (metrics.perTool.get(name) ?? 0) + 1);
}

export function snapshot(): Record<string, unknown> {
  return {
    uptime_seconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
    http_requests: metrics.httpRequests,
    http_errors: metrics.httpErrors,
    mcp_calls: metrics.mcpCalls,
    mcp_call_errors: metrics.mcpCallErrors,
    auth_rejections: metrics.authRejections,
    per_tool: Object.fromEntries(metrics.perTool),
  };
}
