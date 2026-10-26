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
      if (!process.env.PORTUS_SMTP_HOST || !process.env.PORTUS_SMTP_USER || !process.env.PORTUS_SMTP_PASSWORD || !process.env.PORTUS_SMTP_FROM) {
        return { ok: false, error: "SMTP não configurado. Relatório salvo em: " + filePath };
      }
      try {
        const nodemailer = require("nodemailer");
        const port = Number(process.env.PORTUS_SMTP_PORT ?? "587");
        const transport = nodemailer.createTransport({
          host: process.env.PORTUS_SMTP_HOST, port, secure: port === 465,
          auth: { user: process.env.PORTUS_SMTP_USER, pass: process.env.PORTUS_SMTP_PASSWORD },
          connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
        });
        try {
          await transport.sendMail({
            from: process.env.PORTUS_SMTP_FROM,
            to: "lenix.camargo@gmail.com",
            subject: "[PORTUS] Reportar Erro - " + timestamp,
            text: "Relatório de erro enviado pela estação " + os.hostname() + ".\\n\\n" + description + "\\n\\nConsulte o log completo anexado.",
            attachments: [{ filename: "portus-error-" + timestamp.replace(/[:.]/g, "-") + ".txt", path: filePath }]
          });
        } finally { transport.close(); }
      } catch (error) {
        return { ok: false, error: "Falha ao enviar e-mail SMTP: " + (error instanceof Error ? error.message : String(error)) + ". Relatório salvo em: " + filePath };
      }
      const sent = true;
      return { ok: true, data: { sent, filePath } };
    })
  );
}
