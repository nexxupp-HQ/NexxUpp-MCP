import { AsyncLocalStorage } from "node:async_hooks";

// Per-request caller identity. In hosted mode the HTTP layer stores the
// validated caller here; tool code reads it instead of the env session.
export type Caller = { token: string; userId: string };

const als = new AsyncLocalStorage<Caller>();

export function runWithCaller<T>(caller: Caller, fn: () => T): T {
  return als.run(caller, fn);
}

export function currentCaller(): Caller | undefined {
  return als.getStore();
}
