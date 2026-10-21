import os from "node:os";
import { createHash } from "node:crypto";
import { getRecentLogs } from "./logger";

const DESTINATION = "lenix.camargo@gmail.com";
const COOLDOWN_MS = 15 * 60 * 1000;
const recent = new Map<string, number>();
let sending = false;
const pending: Array<{ source: string; message: string; stack?: string }> = [];

function sanitize(value: string): string {
  return value
    .replace(/(password|senha|token|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, "$1[REDACTED]@")
    .replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]")
    .slice(0, 16000);
}

function configured(): boolean {
  return Boolean(process.env.PORTUS_SMTP_HOST && process.env.PORTUS_SMTP_USER &&
    process.env.PORTUS_SMTP_PASSWORD && process.env.PORTUS_SMTP_FROM);
}

export function reportErrorByEmail(source: string, message: string, stack?: string): void {
  if (!configured()) return;
  const key = createHash("sha256").update(source + "\n" + message).digest("hex");
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < COOLDOWN_MS) return;
  recent.set(key, now);
  if (recent.size > 500) {
    for (const [id, timestamp] of recent) if (now - timestamp > COOLDOWN_MS) recent.delete(id);
  }
  if (pending.length >= 25) return;
  pending.push({ source, message, stack });
  void flush();
}

async function flush(): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    // Keep SMTP entirely in Electron main; never expose credentials to renderer.
    const nodemailer = require("nodemailer") as { createTransport: (options: Record<string, unknown>) => { sendMail: (message: Record<string, unknown>) => Promise<unknown>; close: () => void } };
    const port = Number(process.env.PORTUS_SMTP_PORT ?? "587");
    const transport = nodemailer.createTransport({
      host: process.env.PORTUS_SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.PORTUS_SMTP_USER,
        pass: process.env.PORTUS_SMTP_PASSWORD
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    while (pending.length) {
      const item = pending.shift()!;
      const logs = getRecentLogs().slice(-30).map(sanitize).join("\n");
      try {
        await transport.sendMail({
          from: process.env.PORTUS_SMTP_FROM,
          to: DESTINATION,
          subject: "[PORTUS] Falha: " + sanitize(item.source).slice(0, 90).replace(/[\r\n]/g, " "),
          text: [
            "PORTUS — Erro automático",
            "Data UTC: " + new Date().toISOString(),
            "Máquina: " + os.hostname(),
            "Plataforma: " + process.platform + "/" + process.arch,
            "Origem: " + sanitize(item.source),
            "Mensagem: " + sanitize(item.message),
            "Stack: " + sanitize(item.stack ?? "(indisponível)"),
            "",
            "Logs recentes:",
            logs
          ].join("\n")
        });
      } catch (error) {
        // Never call logError here: that would recursively trigger email reporting.
        console.error("[error-email] Falha no SMTP:", error instanceof Error ? error.message : String(error));
      }
    }
    transport.close();
  } catch (error) {
    pending.length = 0;
    console.error("[error-email] Transporte indisponível:", error instanceof Error ? error.message : String(error));
  } finally {
    sending = false;
  }
}
