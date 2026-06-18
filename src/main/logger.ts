import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logsDir = "";

const RING_SIZE = 500;
const logRing: string[] = [];

export function initLogger(userDataPath: string): void {
  logsDir = join(userDataPath, "logs");
  try {
    mkdirSync(logsDir, { recursive: true });
  } catch {
    // se não conseguir criar a pasta, logError vai falhar silenciosamente
  }
}

export function getLogsDir(): string {
  return logsDir;
}

export function getRecentLogs(): string[] {
  return [...logRing];
}

function logLine(level: "ERROR" | "WARN" | "INFO", source: string, message: string, extra?: string): void {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(0, 19).replace("T", " ");

  let entry = `[${time}] [${level}] [${source}] ${message}`;
  if (extra) entry += "\n" + extra.split("\n").map(l => `  ${l}`).join("\n");

  logRing.push(entry);
  if (logRing.length > RING_SIZE) logRing.shift();

  if (logsDir) {
    const file = join(logsDir, `portus-${date}.log`);
    try {
      appendFileSync(file, entry + "\n", "utf-8");
    } catch {
      // falha silenciosa — nunca deve derrubar o app
    }
  }
}

export function logError(source: string, message: string, errorOrStack?: unknown): void {
  let extra: string | undefined;
  if (errorOrStack instanceof Error) {
    extra = errorOrStack.stack ?? errorOrStack.message;
  } else if (typeof errorOrStack === "string") {
    extra = errorOrStack;
  } else if (errorOrStack != null) {
    extra = String(errorOrStack);
  }
  logLine("ERROR", source, message, extra);
}

export function logWarn(source: string, message: string): void {
  logLine("WARN", source, message);
}

export function logInfo(source: string, message: string): void {
  logLine("INFO", source, message);
}
