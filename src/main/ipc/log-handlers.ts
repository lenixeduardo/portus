import { ipcMain } from "electron";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IPC, type LogReportInput } from "../../shared/ipc";
import { getLogsDir, getRecentLogs, logError } from "../logger";

import { requireAuth } from "./middleware";

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
      {
        const ts = timestamp.replace(/[:.]/g, "-").slice(0, 19);
        const targetDir = logsDir || join(tmpdir(), "portus-error-reports");
        mkdirSync(targetDir, { recursive: true });
        const path = join(targetDir, `report-${ts}.txt`);
        try {
          writeFileSync(path, reportText, "utf-8");
          filePath = path;
        } catch {
          // falha silenciosa
        }
      }

      if (!filePath) return { ok: false, error: "Não foi possível gerar o anexo de logs." };
      try {
        const { centralQuery } = await import("../db/central-connection");
        await centralQuery(
          "INSERT INTO portus_error_report_queue (station_name, description, attachment_name, attachment_text) VALUES ($1, $2, $3, $4)",
          [os.hostname(), description, "portus-error-" + timestamp.replace(/[:.]/g, "-") + ".txt", reportText]
        );
      } catch (error) {
        return { ok: false, error: "Não foi possível colocar o relatório na fila central: " + (error instanceof Error ? error.message : String(error)) + ". Arquivo local: " + filePath };
      }
      const sent = false;
      return { ok: true, data: { sent, filePath } };
    })
  );
}
