import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logsDir = "";

export function initLogger(userDataPath: string): void {
  logsDir = join(userDataPath, "logs");
  try {
    mkdirSync(logsDir, { recursive: true });
  } catch {
    // se não conseguir criar a pasta, logError vai falhar silenciosamente
  }
}

function logLine(level: "ERROR" | "WARN" | "INFO", source: string, message: string, extra?: string): void {
  if (!logsDir) return;

  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toISOString().slice(0, 19).replace("T", " "); // YYYY-MM-DD HH:MM:SS

  const file = join(logsDir, `portus-${date}.log`);
  let entry = `[${time}] [${level}] [${source}] ${message}\n`;
  if (extra) entry += extra.split("\n").map(l => `  ${l}`).join("\n") + "\n";

  try {
    appendFileSync(file, entry, "utf-8");
  } catch {
    // falha silenciosa — nunca deve derrubar o app
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
