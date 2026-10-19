import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
    ipcHandlers.set(channel, handler);
  } }
}));

const outDir = join(process.cwd(), "test-results", "qa-acceptance");
const stationCode = "QA-SUPERVISOR-REPORT";
const credential = "QA-Supervisor-12345";
let browser: Browser | null = null;
let viteProcess: ReturnType<typeof spawn> | null = null;

afterAll(async () => {
  await browser?.close();
  if (viteProcess && viteProcess.exitCode === null) viteProcess.kill();
});

async function serveRenderer(): Promise<string> {
  const url = "http://127.0.0.1:5181";
  let logs = "";
  viteProcess = spawn(process.execPath, [
    join(process.cwd(), "node_modules", "vite", "bin", "vite.js"),
    "--configLoader", "runner", "--host", "127.0.0.1",
    "--port", "5181", "--strictPort"
  ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  viteProcess.stdout?.on("data", chunk => { logs += String(chunk).slice(-1000); });
  viteProcess.stderr?.on("data", chunk => { logs += String(chunk).slice(-1000); });
  for (let attempt = 0; attempt < 110; attempt++) {
    if (viteProcess.exitCode !== null) throw new Error("Vite encerrou:\n" + logs);
    try {
      if ((await fetch(url)).ok) return url;
    } catch { /* waiting for local Vite */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Vite indisponível:\n" + logs);
}

describe.skipIf(process.env.PORTUS_QA_E2E !== "1")("Homologação real PORTUS: Supervisor e relatório impresso", () => {
  it("Master cadastra Supervisor, faz login pela tela e imprime PDF com nome renomeado", async () => {
    mkdirSync(outDir, { recursive: true });
    process.env.PORTUS_STATION_CODE = stationCode;
    const {
      centralQuery, closeCentralDatabase
    } = await import("../db/central-connection");
    const { createCentralUser } = await import("../db/central-users-repo");
    const { login, logout } = await import("../auth/auth-service");
    const { registerUsersHandlers } = await import("../ipc/users-handlers");
    const { IPC } = await import("../../shared/ipc");
    const { getCentralEquipment, updateCentralEquipment } = await import("../db/central-equipments-repo");
    const { getCentralBatchHistory } = await import("../db/central-history-repo");
    const { buildBatchPrintHtml } = await import("../db/traceability-report");
    const { buildCsvContent } = await import("../db/central-report-content");
    const { excelReportRows, writeBatchReportXlsx } = await import("../db/excel-report");

    try {
      // Dados exclusivos do PostgreSQL efêmero deste job.
      const master = await createCentralUser({
        username: "master.qa", displayName: "Master QA",
        password: credential, role: "master", sectorCode: "ADMIN"
      });
      expect(master.role).toBe("master");
      expect((await login(master.username, credential))?.role).toBe("master");

      registerUsersHandlers();
      const createHandler = ipcHandlers.get(IPC.usersCreate);
      expect(createHandler, "IPC users:create precisa existir").toBeTypeOf("function");
      const created = await createHandler!({}, {
        username: "supervisor.qa", displayName: "Supervisor Teste",
        password: credential, role: "supervisor", sectorCode: "PRODUCTION"
      }) as { ok: boolean; data?: { id: number; role: string; sectorCode: string }; error?: string };
      expect(created.ok, created.error).toBe(true);
      expect(created.data?.role).toBe("supervisor");
      expect(created.data?.sectorCode).toBe("PRODUCTION");

      // Login real com bcrypt no banco; em seguida, UI real no Chromium.
      logout();
      const authenticated = await login("supervisor.qa", credential);
      expect(authenticated?.role).toBe("supervisor");
      expect(authenticated?.id).toBe(created.data?.id);
      logout();

      browser = await chromium.launch({ headless: true });
      const url = await serveRenderer();
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const browserErrors: string[] = [];
      page.on("pageerror", error => browserErrors.push(error.message));
      await page.exposeFunction("__qaLogin", async (value: { username: string; password: string }) => {
        const user = await login(value.username, value.password);
        return user ? { ok: true, user } : { ok: false, error: "Usuário ou senha inválidos." };
      });
      const version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;
      await page.addInitScript(({ appVersion }) => {
        localStorage.setItem("portus:last-seen-version", appVersion);
        const status = { configured: true, available: true, required: true, mode: "central" };
        (window as any).api = {
          auth: {
            currentUser: async () => null,
            login: (credentials: { username: string; password: string }) => (window as any).__qaLogin(credentials),
            logout: async () => {}
          },
          setup: { status: async () => ({ ...status, supported: true, setupCompleted: true,
            postgresBin: null, stationCode: "QA-SUPERVISOR-REPORT", postgresServiceStatus: "running" }) },
          updates: { check: async () => null },
          capture: { onEnded: () => () => {}, isActive: async () => false },
          central: { status: async () => status, batches: { listOpen: async () => [] } },
          users: { findByBarcode: async () => null },
          log: { error: async () => {} }
        };
      }, { appVersion: version });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByPlaceholder("USER_ID").fill("supervisor.qa");
      await page.locator('input[type="password"]').fill(credential);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByRole("heading", { name: "Lotes Ativos" }).waitFor({ timeout: 20000 });
      expect(await page.getByText("Não foi possível concluir o login.").count()).toBe(0);
      expect(browserErrors).toEqual([]);
      await page.screenshot({ path: join(outDir, "supervisor-login.png"), fullPage: true });
      await page.close();
      console.log("PASS: Supervisor criado pelo IPC como Master e autenticado na tela real do Chromium.");

      // Lote de teste com leitura na estação que contém o equipamento renomeado.
      const idOf = async (sql: string, args: unknown[] = []) => {
        const result = await centralQuery<{ id: string | number }>(sql, args);
        const id = Number(result.rows[0]?.id);
        expect(id).toBeGreaterThan(0);
        return id;
      };
      const sectorId = await idOf("SELECT id FROM sectors WHERE code='PRODUCTION'");
      const appId = await idOf("SELECT id FROM applications WHERE code='PORTUS'");
      const stationId = await idOf(
        "INSERT INTO stations(sector_id,code,name) VALUES($1,$2,$3) RETURNING id",
        [sectorId, stationCode, "Estação QA"]
      );
      const productId = await idOf(
        "INSERT INTO products(name,created_by) VALUES($1,$2) RETURNING id",
        ["Produto para Teste de Impressão", master.id]
      );
      const batchId = await idOf(
        "INSERT INTO batches(product_id,code,status,created_by) VALUES($1,$2,'open',$3) RETURNING id",
        [productId, "QA-PRINT-0001", master.id]
      );
      const sessionId = await idOf(
        "INSERT INTO capture_sessions(batch_id,sector_id,station_id,source_application_id,user_id,timeout_seconds,status) "+
        "VALUES($1,$2,$3,$4,$5,30,'completed') RETURNING id",
        [batchId, sectorId, stationId, appId, created.data!.id]
      );
      const equipId = await idOf("SELECT id FROM equipments WHERE code='BALANCA'");
      const original = await getCentralEquipment(equipId);
      expect(original).toBeTruthy();
      await centralQuery(
        "INSERT INTO readings(batch_id,equipment_id,capture_session_id,value_raw,value_parsed) "+
        "VALUES($1,$2,$3,$4,$5)", [batchId, equipId, sessionId, "124.55", "124.55"]
      );

      const before = await getCentralBatchHistory(batchId, master.username, "PRODUCTION");
      expect(before?.sessions[0]?.readings[0]?.equipmentName).toBe(original!.name);

      const newName = "Balança de Precisão";
      const renamed = await updateCentralEquipment(equipId, { name: newName });
      expect(renamed?.name).toBe(newName);
      const after = await getCentralBatchHistory(batchId, master.username, "PRODUCTION");
      expect(after).toBeTruthy();
      expect(after!.sessions[0].readings[0].equipmentName).toBe(newName);

      const html = buildBatchPrintHtml(after!);
      expect(html).toContain(newName);
      const pdfPage = await browser.newPage();
      await pdfPage.setContent(html, { waitUntil: "load" });
      await pdfPage.pdf({ path: join(outDir, "relatorio-lote-QA-PRINT-0001.pdf"),
        format: "A4", printBackground: true });
      await pdfPage.screenshot({ path: join(outDir, "relatorio-preview.png"), fullPage: true });
      await pdfPage.close();
      const pdfText = execFileSync("pdftotext", [
        "-layout", join(outDir, "relatorio-lote-QA-PRINT-0001.pdf"), "-"
      ], { encoding: "utf8" }).replace(/\s+/g, " ");
      expect(pdfText).toContain(newName);
      expect(pdfText).not.toContain("Balanca");
      expect(excelReportRows(after!)[0][2]).toBe(newName);
      expect(buildCsvContent(after!)).toContain(newName);
      writeBatchReportXlsx(join(outDir, "relatorio-lote-QA-PRINT-0001.xlsx"), after!);
      writeFileSync(join(outDir, "resultado.txt"), [
        "RESULTADO: APROVADO",
        "Supervisor criado pelo Master via IPC: supervisor.qa",
        "Login bcrypt validado: supervisor",
        "Login na UI Chromium: Lotes Ativos exibido",
        "Nome anterior: " + original!.name,
        "Nome novo: " + newName,
        "PDF impresso: nome novo identificado no texto extraído",
        "Excel/CSV: nome novo validado",
        "Banco PostgreSQL: somente ambiente isolado de GitHub Actions"
      ].join("\n") + "\n");
      console.log("PASS: Relatório PDF impresso e Excel exportado usando '" + newName + "'.");
    } finally {
      logout();
      await closeCentralDatabase();
    }
  }, 120000);
});
