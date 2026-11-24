import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseURL = "http://127.0.0.1:5181";
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
let vite;
let browser;
let log = "";

before(async () => {
  vite = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"),
    "--configLoader", "runner", "--host", "127.0.0.1", "--port", "5181", "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [vite.stdout, vite.stderr]) stream.on("data", data => { log += data; });
  const deadline = Date.now() + 45000;
  while (true) {
    if (vite.exitCode !== null || Date.now() > deadline) throw new Error(log);
    try { if ((await fetch(baseURL)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
});

after(async () => { await browser?.close(); if (vite?.exitCode === null) vite.kill(); });

async function openDashboard({ completed = true } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({ appVersion, completed }) => {
    localStorage.setItem("portus:last-seen-version", appVersion);
    const user = { id: 1, username: "lab", role: "operator", sectorCode: "LABORATORY", laboratoryProfile: "capture" };
    const batch = { id: 1, code: "LAB-001", productId: 1, productName: "Produto", status: "open", completed,
      openedAt: "2026-10-14T12:00:00Z", operatorName: "Operador", readingsCount: 1 };
    window.requests = [];
    window.batchFinalized = false;
    window.api = {
      auth: { currentUser: async () => user, logout: async () => {} },
      setup: { status: async () => ({ configured: true, available: true, required: true, mode: "central", supported: true, setupCompleted: true }) },
      updates: { check: async () => null, verify: async () => ({ status: "current" }) },
      capture: { onEnded: () => () => {}, isActive: async () => false },
      equipments: { list: async () => [
        { id: 1, name: "Balança de precisão", slotIndex: 1, enabled: true },
        { id: 2, name: "Viscosímetro", slotIndex: 2, enabled: true }
      ] },
      users: { findByBarcode: async () => null }, log: { error: async () => {} },
      central: { status: async () => ({ configured: true, available: true, required: true }),
        batches: { listOpen: async () => window.batchFinalized ? [] : [batch],
          finalize: (id, justification) => new Promise((resolve, reject) => window.requests.push({ id, justification, resolve, reject })) } }
    };
  }, { appVersion: version, completed });
  await page.goto(baseURL);
  return page;
}

test("laboratory finalization stays pending, preserves errors and allows retry", async () => {
  const page = await openDashboard();
  try {
    await page.getByRole("button", { name: "Finalizar lote", exact: true }).click();
    await page.locator("#batch-close-justification").fill("Análises do laboratório aprovadas");
    const dialog = page.locator(".modal-card");
    await dialog.getByRole("button", { name: "Finalizar lote", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 1);
    assert.equal(await dialog.count(), 1, "confirmation must stay visible until the server responds");
    assert.equal(await dialog.getByRole("button", { name: "Finalizando…" }).isDisabled(), true);
    await page.evaluate(() => window.requests[0].reject(new Error("Conexão interrompida")));
    await dialog.getByRole("alert").filter({ hasText: "Conexão interrompida" }).waitFor();
    assert.equal(await page.locator("#batch-close-justification").inputValue(), "Análises do laboratório aprovadas");
    await dialog.getByRole("button", { name: "Finalizar lote", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 2);
    await page.evaluate(() => window.requests[1].resolve({ ok: false, error: "Marque Lote concluído antes de finalizar" }));
    await dialog.getByRole("alert").filter({ hasText: "Marque Lote concluído" }).waitFor();
    await dialog.getByRole("button", { name: "Finalizar lote", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 3);
    await page.evaluate(() => { window.batchFinalized = true; window.requests[2].resolve({ ok: true, data: { id: 1, status: "closed" } }); });
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.querySelector(".batch-row"));
  } finally { await page.close(); }
});


test("equipment selection starts empty each time the capture dialog opens", async () => {
  const page = await openDashboard({ completed: false });
  try {
    const reading = page.getByRole("button", { name: "Iniciar leitura", exact: true });
    const dialog = page.locator(".modal-card").filter({ hasText: "Selecionar Equipamentos" });
    const confirm = dialog.getByRole("button", { name: "Iniciar Captura", exact: true });
    const balance = dialog.locator("li").filter({ hasText: "Balança de precisão" }).getByRole("checkbox");

    await reading.click();
    await dialog.getByText("Viscosímetro", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("checkbox", { checked: true }).count(), 0);
    assert.equal(await confirm.isDisabled(), true);

    await balance.check();
    assert.equal(await dialog.getByRole("checkbox", { checked: true }).count(), 1);
    assert.equal(await confirm.isEnabled(), true);

    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await reading.click();
    await dialog.getByText("Viscosímetro", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("checkbox", { checked: true }).count(), 0);
    assert.equal(await confirm.isDisabled(), true);
  } finally { await page.close(); }
});
