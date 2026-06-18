/**
 * PORTUS — Webhook para Obsidian
 *
 * Servidor HTTP local que recebe os relatórios de erro enviados pelo PORTUS
 * e os persiste como notas Markdown no vault do Obsidian.
 *
 * Cada relatório vira uma nota individual em:
 *   <vault>/<pasta>/YYYY-MM-DD HH-MM - Relatório de Erro.md
 *
 * Uso:
 *   node dist/tools/obsidian-webhook.js [--vault <caminho>] [--folder <pasta>] [--port <porta>]
 *
 * Ou via variáveis de ambiente:
 *   OBSIDIAN_VAULT_PATH=C:\Users\user\Documents\MeuVault
 *   OBSIDIAN_FOLDER=PORTUS Erros
 *   PORT=4242
 *
 * Configure a URL no PORTUS em: Configurações > Captura > Webhook para relatório de erros
 *   http://localhost:4242
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PortusReport {
  app: string;
  timestamp: string;
  description: string;
  platform: string;
  arch: string;
  logs: string[];
}

interface Config {
  vaultPath: string;
  folder: string;
  port: number;
  dailyNotes: boolean;
  dailyNotesFolder: string;
}

// ─── Configuração ─────────────────────────────────────────────────────────────

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const out: Partial<Config> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault" && args[i + 1]) out.vaultPath = args[++i];
    else if (args[i] === "--folder" && args[i + 1]) out.folder = args[++i];
    else if (args[i] === "--port" && args[i + 1]) out.port = Number(args[++i]);
    else if (args[i] === "--daily-notes") out.dailyNotes = true;
    else if (args[i] === "--daily-notes-folder" && args[i + 1]) out.dailyNotesFolder = args[++i];
  }
  return out;
}

function loadConfig(): Config {
  const args = parseArgs();
  const defaults: Config = {
    vaultPath: process.env.OBSIDIAN_VAULT_PATH ?? join(homedir(), "Documents", "Obsidian Vault"),
    folder: process.env.OBSIDIAN_FOLDER ?? "PORTUS Erros",
    port: Number(process.env.PORT ?? 4242),
    dailyNotes: process.env.OBSIDIAN_DAILY_NOTES === "1",
    dailyNotesFolder: process.env.OBSIDIAN_DAILY_NOTES_FOLDER ?? "Daily Notes"
  };
  return { ...defaults, ...args };
}

// ─── Formatação Markdown ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function safeFilename(iso: string): string {
  // "2026-06-18T10:30:00.000Z" → "2026-06-18 10-30"
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${date} ${time}`;
}

function buildNote(report: PortusReport): string {
  const date = formatDate(report.timestamp);
  const time = formatTime(report.timestamp);
  const logBlock = report.logs.length
    ? report.logs.join("\n")
    : "(nenhum log registrado)";

  return [
    "---",
    "tags:",
    "  - portus",
    "  - erro",
    `date: ${new Date(report.timestamp).toISOString().slice(0, 10)}`,
    `timestamp: "${report.timestamp}"`,
    `plataforma: "${report.platform}/${report.arch}"`,
    "---",
    "",
    `# Relatório de Erro PORTUS — ${date} ${time}`,
    "",
    "## Descrição",
    "",
    report.description,
    "",
    "## Logs Recentes",
    "",
    "```",
    logBlock,
    "```",
    ""
  ].join("\n");
}

function buildDailyNoteEntry(report: PortusReport): string {
  const time = formatTime(report.timestamp);
  const logBlock = report.logs.slice(-20).join("\n");

  return [
    "",
    `## ${time} — Relatório de Erro PORTUS`,
    "",
    report.description,
    "",
    "<details>",
    "<summary>Logs recentes</summary>",
    "",
    "```",
    logBlock,
    "```",
    "",
    "</details>",
    ""
  ].join("\n");
}

// ─── Persistência ─────────────────────────────────────────────────────────────

function saveReport(report: PortusReport, config: Config): { path: string; mode: string } {
  const noteDir = join(resolve(config.vaultPath), config.folder);
  mkdirSync(noteDir, { recursive: true });

  if (config.dailyNotes) {
    // Modo: acrescenta ao daily note do dia
    const day = new Date(report.timestamp).toISOString().slice(0, 10);
    const dailyDir = join(resolve(config.vaultPath), config.dailyNotesFolder);
    mkdirSync(dailyDir, { recursive: true });
    const dailyPath = join(dailyDir, `${day}.md`);

    const header = existsSync(dailyPath)
      ? ""
      : `---\ndate: ${day}\ntags:\n  - portus\n---\n\n# ${day}\n`;

    appendFileSync(dailyPath, header + buildDailyNoteEntry(report), "utf-8");
    return { path: dailyPath, mode: "daily-note" };
  }

  // Modo padrão: nota individual por relatório
  const filename = `${safeFilename(report.timestamp)} - Relatório de Erro.md`;
  const notePath = join(noteDir, filename);
  writeFileSync(notePath, buildNote(report), "utf-8");
  return { path: notePath, mode: "individual" };
}

// ─── Servidor HTTP ────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function respond(res: ServerResponse, status: number, body: object): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(json);
}

function startServer(config: Config): void {
  const server = createServer(async (req, res) => {
    // Preflight CORS
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST" });
      res.end();
      return;
    }

    if (req.method !== "POST") {
      respond(res, 405, { ok: false, error: "Método não permitido. Use POST." });
      return;
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      respond(res, 400, { ok: false, error: "Falha ao ler o corpo da requisição." });
      return;
    }

    let report: PortusReport;
    try {
      report = JSON.parse(raw);
    } catch {
      respond(res, 400, { ok: false, error: "JSON inválido." });
      return;
    }

    if (!report.description || !report.timestamp) {
      respond(res, 422, { ok: false, error: "Campos obrigatórios ausentes: description, timestamp." });
      return;
    }

    try {
      const { path, mode } = saveReport(report, config);
      const rel = path.replace(resolve(config.vaultPath), "<vault>");
      console.log(`[${new Date().toISOString().slice(11, 19)}] Nota salva (${mode}): ${rel}`);
      respond(res, 200, { ok: true, path: rel, mode });
    } catch (err) {
      console.error("Erro ao salvar nota:", err);
      respond(res, 500, { ok: false, error: "Falha ao salvar nota no vault." });
    }
  });

  server.listen(config.port, "127.0.0.1", () => {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║    PORTUS — Webhook para Obsidian                    ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log(`Servidor:  http://localhost:${config.port}`);
    console.log(`Vault:     ${resolve(config.vaultPath)}`);
    console.log(`Pasta:     ${config.folder}`);
    console.log(`Modo:      ${config.dailyNotes ? `daily notes (${config.dailyNotesFolder})` : "notas individuais"}`);
    console.log("");
    console.log("Configure no PORTUS → Configurações → Captura:");
    console.log(`  Webhook para relatório de erros: http://localhost:${config.port}`);
    console.log("");
    console.log("Aguardando relatórios... (Ctrl+C para encerrar)");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Porta ${config.port} já está em uso. Use --port <outra> para mudar.`);
    } else {
      console.error("Erro no servidor:", err.message);
    }
    process.exit(1);
  });
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

const config = loadConfig();
startServer(config);
