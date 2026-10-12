import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const baseURL = "http://127.0.0.1:5173";
const screenshotDir = join(root, "test-results", "browser");
let vite;
let browser;
let viteLog = "";

async function waitForVite() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite encerrou antes de iniciar:\n${viteLog}`);
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Servidor ainda iniciando.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Vite não respondeu em 45s:\n${viteLog}`);
}

before(async () => {
  await mkdir(screenshotDir, { recursive: true });
  vite = spawn(process.execPath, [
    join(root, "node_modules", "vite", "bin", "vite.js"),
    "--configLoader", "runner",
    "--host", "127.0.0.1", "--port", "5173", "--strictPort"
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [vite.stdout, vite.stderr]) {
    stream.on("data", data => { viteLog += String(data).slice(-4000); });
  }
  await waitForVite();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  });
});

after(async () => {
  await browser?.close();
  if (vite && vite.exitCode === null) vite.kill();
});

const fixtures = [
  {
    id: 1, code: "1210.0410.00142", productId: 1,
    productName: "CORPAL DPC PR. ATIVO", status: "open", completed: false,
    openedAt: "2026-10-12T15:58:00", operatorName: "ISABELA.OLIVEIRA",
    readingsCount: 0, productionClosed: false, laboratoryClosed: false,
    readingPreviews: []
  },
  {
    id: 2, code: "SIM-2026-3222", productId: 2,
    productName: "PRODUTO INDUSTRIAL COM NOME EXTENSO PARA VALIDAR A QUEBRA DE LINHA SEM CARACTERES OCULTOS",
    status: "open", completed: false, openedAt: "2026-10-09T15:37:00",
    operatorName: "admin", readingsCount: 5, productionClosed: false,
    laboratoryClosed: false, readingPreviews: []
  }
];

async function openDashboard(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ appVersion, batches }) => {
    localStorage.setItem("portus:last-seen-version", appVersion);
    localStorage.setItem("portus:theme", "dark");
    const user = {
      id: 1, username: "admin", displayName: "admin",
      role: "admin", sectorCode: "ADMIN", active: true,
      createdAt: "2026-10-01T12:00:00"
    };
    const status = { configured: true, available: true, required: true, mode: "central" };
    window.api = {
      auth: { currentUser: async () => user, logout: async () => {} },
      setup: { status: async () => ({
        ...status, supported: true, setupCompleted: true, postgresBin: null,
        stationCode: "TESTE", postgresServiceStatus: "running"
      }) },
      updates: { check: async () => null },
      capture: { onEnded: () => () => {}, isActive: async () => false },
      central: {
        status: async () => status,
        batches: { listOpen: async () => batches }
      },
      users: { findByBarcode: async () => null },
      log: { error: async () => {} }
    };
  }, { appVersion: version, batches: fixtures });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".batch-row").first().waitFor({ timeout: 15000 });
  return { page, errors };
}

for (const [label, width, height] of [
  ["desktop", 1600, 900],
  ["compacto", 1024, 768]
]) {
  test(`Dashboard real no Chromium — ${label}`, async () => {
    const { page, errors } = await openDashboard(width, height);
    try {
      assert.equal(await page.locator(".batch-row").count(), fixtures.length);
      assert.equal(await page.getByText("Kairos Connect").count(), 0);
      for (const [index, fixture] of fixtures.entries()) {
        const card = page.locator(".batch-row").nth(index);
        const metrics = await card.evaluate(element => {
          const badge = element.querySelector(".chip");
          const code = element.querySelector(".batch-code");
          const product = element.querySelector(".batch-recipe");
          const barcode = element.querySelector(".batch-barcode svg");
          const bar = barcode?.querySelector("rect");
          return {
            badgeAboveCode: badge.getBoundingClientRect().bottom <= code.getBoundingClientRect().top,
            code: code.textContent,
            product: product.textContent,
            codeOverflow: getComputedStyle(code).textOverflow,
            productOverflow: getComputedStyle(product).overflowX,
            barcodeWidth: barcode.getBoundingClientRect().width,
            barcodeHeight: barcode.getBoundingClientRect().height,
            barColor: bar ? getComputedStyle(bar).fill : null
          };
        });
        assert.equal(metrics.badgeAboveCode, true, "Badge precisa ficar acima do lote");
        assert.equal(metrics.code, `#${fixture.code}`);
        assert.equal(metrics.product, fixture.productName);
        assert.notEqual(metrics.codeOverflow, "ellipsis", "Código não pode ser truncado");
        assert.notEqual(metrics.productOverflow, "hidden", "Produto não pode ficar oculto");
        assert.ok(metrics.barcodeWidth >= 160, `Barcode pequeno: ${metrics.barcodeWidth}px`);
        assert.ok(metrics.barcodeHeight >= 30, "Barcode sem altura suficiente");
        assert.ok(metrics.barColor, "SVG do código de barras não foi renderizado");
      }
      assert.deepEqual(errors, [], "Erros não tratados no renderer");
      await page.screenshot({
        path: join(screenshotDir, `dashboard-${label}.png`),
        fullPage: true,
        animations: "disabled"
      });
    } finally {
      await page.close();
    }
  });
}
