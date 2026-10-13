import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseURL = "http://127.0.0.1:5179";
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
let vite;
let browser;
let log = "";

before(async () => {
  vite = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"),
    "--configLoader", "runner", "--host", "127.0.0.1", "--port", "5179", "--strictPort"],
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

async function openHistory() {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(appVersion => {
    localStorage.setItem("portus:last-seen-version", appVersion);
    window.user = { id: 1, username: "master", displayName: "Master", role: "master",
      sectorCode: "ADMIN", active: true, createdAt: "2026-10-12T12:00:00Z" };
    const batches = [1, 2].map(id => ({ id, code: `LOTE-${id}`, productId: id,
      productName: `Produto ${id}`, status: "closed", completed: true,
      openedAt: "2026-10-12T12:00:00Z", closedAt: "2026-10-12T13:00:00Z",
      operatorId: 1, operatorName: "Master", readingsCount: 0,
      productionClosed: true, laboratoryClosed: true }));
    window.requests = [];
    window.reopenRequests = [];
    const getBatch = id => new Promise((resolve, reject) => window.requests.push({ id, resolve, reject }));
    window.resolveHistory = (index, id) => window.requests[index].resolve({ ok: true,
      data: { batch: batches.find(batch => batch.id === id), sessions: [], auditEvents: [] } });
    window.api = {
      auth: { currentUser: async () => window.user, logout: async () => {} },
      setup: { status: async () => ({ configured: true, available: true, required: true, mode: "central",
        supported: true, setupCompleted: true, postgresBin: null, stationCode: "TESTE", postgresServiceStatus: "running" }) },
      updates: { check: async () => null },
      capture: { onEnded: () => () => {}, isActive: async () => false },
      users: { findByBarcode: async () => null },
      log: { error: async () => {} },
      central: { status: async () => ({ configured: true, available: true, required: true, mode: "central" }),
        batches: { listAll: async () => batches, listOpen: async () => [], reopen: id => new Promise(resolve => window.reopenRequests.push({ id, resolve })) },
        history: { getBatch } },
      history: { getBatch }
    };
  }, version);
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByRole("button", { name: /LOTE-1/ }).waitFor();
  return { page, errors };
}

async function select(page, id, count) {
  await page.getByRole("button", { name: new RegExp(`LOTE-${id}`) }).click();
  await page.waitForFunction(count => window.requests.length === count, count);
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// Removing the response guard must expose stale data/errors in the real React DOM.
test("a late previous history cannot replace the selected batch", async () => {
  const { page, errors } = await openHistory();
  try {
    await select(page, 1, 1);
    await select(page, 2, 2);
    await page.evaluate(() => window.resolveHistory(1, 2));
    await page.locator(".history-summary").getByText("Produto 2", { exact: true }).waitFor();
    await page.evaluate(() => window.resolveHistory(0, 1));
    await settle(page);
    assert.equal(await page.locator(".history-summary").getByText("Produto 2", { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("deselecting a pending history clears loading and ignores its late response", async () => {
  const { page } = await openHistory();
  try {
    await select(page, 1, 1);
    await page.getByRole("button", { name: /LOTE-1/ }).click();
    await settle(page);
    assert.equal(await page.getByText("Carregando histórico...").count(), 0);
    await page.evaluate(() => window.resolveHistory(0, 1));
    await settle(page);
    assert.equal(await page.locator(".history-summary").count(), 0);
    assert.equal(await page.getByText("Selecione um lote acima", { exact: false }).count(), 1);
  } finally { await page.close(); }
});

test("a rejected history finishes loading and displays an error without an unhandled rejection", async () => {
  const { page, errors } = await openHistory();
  try {
    await select(page, 1, 1);
    await page.evaluate(() => window.requests[0].reject(new Error("Conexão perdida")));
    await settle(page);
    assert.equal(await page.getByText("Carregando histórico...").count(), 0);
    assert.equal(await page.getByText("Conexão perdida", { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("a previous rejection cannot clear loading or add an error to the new selection", async () => {
  const { page, errors } = await openHistory();
  try {
    await select(page, 1, 1);
    await select(page, 2, 2);
    await page.evaluate(() => window.requests[0].reject(new Error("Erro antigo")));
    await settle(page);
    assert.equal(await page.getByText("Carregando histórico...").count(), 1);
    assert.equal(await page.getByText("Erro antigo", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.resolveHistory(1, 2));
    await page.locator(".history-summary").getByText("Produto 2", { exact: true }).waitFor();
  } finally { await page.close(); }
});

test("reopening keeps the selected batch locked until its refresh completes", async () => {
  const { page } = await openHistory();
  try {
    await select(page, 1, 1);
    await page.evaluate(() => window.resolveHistory(0, 1));
    await page.getByRole("button", { name: "Reabrir lote", exact: true }).click();
    await page.locator("#reopen-batch-reason").fill("Correção necessária nas análises");
    await page.getByRole("button", { name: "Confirmar reabertura" }).click();
    assert.equal(await page.getByRole("button", { name: /LOTE-2/ }).isDisabled(), true);
    await page.evaluate(() => window.reopenRequests[0].resolve({ ok: true,
      data: { id: 1, code: "LOTE-1", productName: "Produto 1", status: "open", completed: false } }));
    await page.waitForFunction(() => window.requests.length === 2);
    assert.equal(await page.getByRole("button", { name: /LOTE-2/ }).isDisabled(), true);
    await page.evaluate(() => window.resolveHistory(1, 1));
    await page.getByRole("button", { name: /LOTE-2/ }).waitFor();
    await settle(page);
    assert.equal(await page.getByRole("button", { name: /LOTE-2/ }).isDisabled(), false);
  } finally { await page.close(); }
});
