// Tiny stderr logger. LOG_LEVEL=debug|info|warn|error (default info).
// One line per event: level, message, key=value pairs. No secrets logged.

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function configured(): Level {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

const MIN = configured();

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < ORDER[MIN]) return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  console.error(`[${level}] ${msg}${parts.length ? " " + parts.join(" ") : ""}`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
