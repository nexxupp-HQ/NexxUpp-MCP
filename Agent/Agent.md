---
description: Rules for cleaning up and simplifying code without removing functionality
alwaysApply: true
---

# Codebase Cleanup Rules

## Prime Directive

Remove accidental complexity. Never remove functionality, features, behavior, or safeguards.

Shorter code is not the goal. A smaller diff is not the goal.
The goal is zero unintended behavior change, with less accidental complexity.

If cleanliness and behavior preservation ever conflict, behavior preservation wins.
If unsure whether a change is safe, do not make it. Flag it instead.

## Hard Constraints (never violate)

1. Never delete a feature, endpoint, flag, or code path just because it looks small, ugly, or unused, unless it has been proven unreachable (see Verification Rules).
2. Never remove security, auth, validation, caller scoping, tool schemas, or the hosted auth gate for any simplification reason.
3. Never change external behavior: MCP tool names/shapes, zod schemas, API responses, function signatures, error types/messages, return shapes, side effects, config defaults.
4. Never drop a configuration option without confirming it is unused across the entire repo, deploy configs, and env files.
5. Never merge two code paths unless they are provably identical in both responsibility and behavior.
6. When in doubt, don't touch it. Ambiguity means leave it alone and ask, not simplify it.

## Before Writing Any Code

Ask in order, stop at the first yes:

1. Does this already exist somewhere in the codebase?
2. Can an existing function or module be extended without changing behavior for existing callers?
3. Does the standard library or an existing dependency already solve this?
4. Only then: write the smallest new code that solves the actual problem. No speculative abstraction.

## Legitimate Cleanup

- True duplication: two implementations with identical responsibility and behavior. Consolidate into one, preserving all call-site behavior.
- Dead code: zero references anywhere, including dynamic dispatch, config-driven calls, tests, and external callers. Confirm exhaustively before removing.
- Unneeded abstraction: a wrapper or interface with exactly one implementation and no real second use case. Inline it, preserving exact behavior.
- Behavior-preserving efficiency fixes: redundant DB/API calls, repeated serialization, N+1 queries. Fix by reusing already-fetched data; output must stay identical.
- Cache infrastructure consolidation: key generation, TTL, serialization. Consolidate mechanics only. Keep semantics separate (idempotency, rate limiting, response caching, session state).

## Not Cleanup (do not do these under the cleanup banner)

- Removing rarely-used paths: feature flags, admin-only routes, legacy-but-still-called endpoints, edge-case handlers.
- Collapsing configuration options into fewer options, even if most are currently set to the same value.
- Rewriting working code purely for style, file size, or "elegance."
- Building a generalized framework to replace several simple, working implementations.
- Replacing a mature, well-tested dependency with custom code just to reduce dependency count.
- Broad, unscoped destructive operations (e.g. deregistering tools in bulk, deleting `dist/` without rebuilding, clearing shared credentials) even to simplify a flow.

## Verification Rules

Before deleting anything, confirm all of the following:

- Full-repo reference search, not just one file or one obvious caller.
- Checked for dynamic/reflective/config-driven invocation (string-based dispatch, DI containers, cron/job configs, feature flags).
- Checked tests, docs, and external API consumers.
- If any doubt remains, do not delete. Mark it as "possibly dead, needs human confirmation" instead.

After changing anything, run and confirm as applicable: `npm run build` (tsc), `npm test` (build + node --test), tool-call smoke test over stdio, hosted auth-gate behavior, caller-scoping behavior, metrics stay PII-free.

For non-trivial changes, diff behavior before vs. after, not just "it compiles."

## Workflow

1. Understand: map tool surface, zod schemas, auth flow, caller context, data flow, dependencies. Don't touch code yet.
2. Find real duplication: same responsibility and same behavior, not just similar shape.
3. Find provably dead code: per the verification rules above, exhaustive, not a quick grep.
4. Apply the smallest safe change: priority order is reuse existing, extend existing, shared infra, new code (only if truly needed).
5. Verify: run tests. Confirm behavior is unchanged except for explicitly authorized fixes.
6. Final check: for every change, ask "could this have removed or altered any feature, config, or safeguard?" If maybe, revert and flag it.

## Final Rule

If a cleanup step would eliminate, hide, disable, or alter any functionality, stop.

That is not cleanup. It is a separate decision requiring explicit human approval, and must never be made unilaterally.
