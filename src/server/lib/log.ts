import type { Logger } from "./types";

const isTTY = typeof process !== "undefined" && process.stderr?.isTTY === true;

function ts(): string {
  return `${new Date().toISOString().slice(11, 19)}Z`;
}

function write(level: "info" | "warn" | "error", msg: string): void {
  const line = `${ts()} ${level.toUpperCase()} ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn" && !isTTY) console.warn(line);
  else console.log(line);
}

export const log: Logger = {
  info: (msg) => write("info", msg),
  warn: (msg) => write("warn", msg),
  error: (msg) => write("error", msg),
};
