import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBearerHeader } from "./http-server.js";
import { describeAuth } from "./config.js";
import { metrics, recordToolCall, snapshot } from "./metrics.js";

describe("parseBearerHeader", () => {
  it("accepts a well-formed bearer token", () => {
    assert.equal(parseBearerHeader("Bearer abc123"), "abc123");
  });
  it("rejects missing, empty, and non-bearer schemes", () => {
    assert.equal(parseBearerHeader(undefined), undefined);
    assert.equal(parseBearerHeader(""), undefined);
    assert.equal(parseBearerHeader("Basic abc123"), undefined);
    assert.equal(parseBearerHeader("Bearer "), undefined);
    assert.equal(parseBearerHeader("Bearer"), undefined);
  });
  it("rejects array values", () => {
    assert.equal(parseBearerHeader(["Bearer a", "Bearer b"]), undefined);
  });
});

describe("describeAuth", () => {
  it("summarizes without leaking secrets", () => {
    const summary = describeAuth();
    assert.match(summary, /api=/);
    assert.match(summary, /cortex=/);
    assert.doesNotMatch(summary, /gho_[A-Za-z0-9]{8,}|cortex_[A-Za-z0-9]{8,}/);
  });
});

describe("metrics", () => {
  it("counts tool calls and failures", () => {
    const before = metrics.mcpCalls;
    recordToolCall("probe_tool", false);
    recordToolCall("probe_tool", true);
    assert.equal(metrics.mcpCalls, before + 2);
    assert.equal(metrics.perTool.get("probe_tool"), 2);
    const snap = snapshot() as { mcp_calls: number; uptime_seconds: number };
    assert.equal(snap.mcp_calls, before + 2);
    assert.ok(snap.uptime_seconds >= 0);
    metrics.perTool.delete("probe_tool");
  });
});
