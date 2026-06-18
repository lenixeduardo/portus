import { ipcMain } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { IPC, type LogReportInput } from "../../shared/ipc";
import { getLogsDir, getRecentLogs, logError } from "../logger";
import { getSetting } from "../db/settings-repo";
import { requireAuth } from "./middleware";

const SUPABASE_REPORT_URL = "https://gvbzijlgvvqoelkimfzb.supabase.co/functions/v1/receive-report";

export function registerLogHandlers(): void {
  ipcMain.handle(IPC.logError, (_e, source: string, message: string, stack?: string) => {
    logError(source, message, stack);
  });

  ipcMain.handle(IPC.logGetRecent, requireAuth(() => getRecentLogs()));

  ipcMain.handle(
    IPC.logSendReport,
    requireAuth(async (_e, input: LogReportInput) => {
      const description = input?.description?.trim() ?? "";
      if (!description) {
        return { ok: false, error: "Descrição é obrigatória." };
      }

      const logs = getRecentLogs();
      const timestamp = new Date().toISOString();
      const webhookUrl = getSetting("error_report_webhook")?.trim() ?? "";

      const reportText = [
        "PORTUS — Relatório de Erro",
        `Timestamp: ${timestamp}`,
        `Plataforma: ${process.platform}/${process.arch}`,
        "",
        "Descrição:",
        description,
        "",
        `--- Logs Recentes (${logs.length} entradas) ---`,
        ...logs
      ].join("\n");

      let filePath: string | null = null;
      const logsDir = getLogsDir();
      if (logsDir) {
        const ts = timestamp.replace(/[:.]/g, "-").slice(0, 19);
        const path = join(logsDir, `report-${ts}.txt`);
        try {
          writeFileSync(path, reportText, "utf-8");
          filePath = path;
        } catch {
          // falha silenciosa
        }
      }

      const payload = {
        app: "PORTUS",
        timestamp,
        description,
        platform: process.platform,
        arch: process.arch,
        logs
      };

      let sent = false;

      // Sempre envia ao endpoint Supabase (cloud do desenvolvedor)
      try {
        const res = await fetch(SUPABASE_REPORT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });
        sent = res.ok;
      } catch {
        // falha de rede — não bloqueia o relatório local
      }

      // Adicionalmente, envia ao webhook configurado pelo usuário se definido
      if (webhookUrl && webhookUrl !== SUPABASE_REPORT_URL) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
          });
        } catch {
          // falha silenciosa no webhook secundário
        }
      }

      return { ok: true, data: { sent, filePath } };
    })
  );
}
