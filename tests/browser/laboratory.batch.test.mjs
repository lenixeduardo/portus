import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseURL = "http://127.0.0.1:5183";
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const timestamp = "2026-11-24T13:30:00Z";
const operator = { id: 11, username: "analista.qa", displayName: "Analista QA",
  role: "operator", sectorCode: "LABORATORY", laboratoryProfile: "capture" };
const supervisor = { id: 22, username: "supervisor.qa", displayName: "Supervisor QA",
  role: "supervisor", sectorCode: "LABORATORY" };
let vite;
let browser;

before(async () => {
  let output = "";
  vite = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"),
    "--configLoader", "runner", "--host", "127.0.0.1", "--port", "5183", "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [vite.stdout, vite.stderr]) stream.on("data", data => { output += data; });
  const deadline = Date.now() + 45000;
  for (;;) {
    if (vite.exitCode !== null || Date.now() > deadline) throw new Error(output);
    try { if ((await fetch(baseURL)).ok) break; } catch {}
    await wait(100);
  }
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
});

after(async () => {
  await browser?.close();
  if (vite?.exitCode === null) vite.kill();
});

function laboratoryFixture() {
  const specification = { id: "5", modelCode: "QA-EPA", version: 1 };
  const parameter = { id: "7", name: "Viscosidade", valueType: "quantitative", origin: "manual", unit: "cP",
    required: true, equipmentId: null, minimum: "10", maximum: "25",
    minimumInclusive: true, maximumInclusive: true, qualitativeValue: null, formula: null };
  const state = { analysis: null, samples: [], result: null, evaluation: null, history: [], closed: false };
  const calls = [];
  let recordError = null;
  function addHistory(user, kind, label, detail = null) {
    state.history.unshift({ id: String(state.history.length + 1), kind, cycle: "1", analysisRevision: 1,
      createdAt: timestamp, actor: user.displayName, label, detail });
  }

  function handle(user, method, input) {
    calls.push({ user: user.id, method, input });
    const reviewer = user.id === supervisor.id;
    if (method === "getBatch") {
      assert.equal(String(input.batchId), "1");
      const canReview = !state.closed && reviewer && Boolean(state.evaluation && !state.evaluation.decision);
      return { ok: true, data: {
        cycle: "1", specification, analysisSpecification: state.analysis ? specification : null,
        analysis: state.analysis, samples: state.samples, evaluation: state.evaluation,
        outcome: state.analysis ? (state.result === null ? "incomplete" : "conforming") : null,
        parameters: [parameter], readings: [], history: state.history,
        permissions: {
          canStart: !state.closed && !state.analysis && !reviewer,
          canCapture: Boolean(!state.closed && state.analysis && !reviewer && !state.evaluation?.decision),
          canSubmit: Boolean(!state.closed && state.analysis && !reviewer && !state.evaluation),
          canApprove: canReview, canReject: canReview
        },
        results: state.samples.map(sample => ({
          id: state.result ? "10" : null, sampleId: sample.id, parameterId: parameter.id,
          numericValue: state.result, qualitativeValue: null, unit: state.result === null ? null : "cP",
          readingId: null, revision: state.result === null ? null : 1, outcome: state.result === null ? "incomplete" : "conforming",
          invalidatedAt: null
        }))
      } };
    }
    if (method === "startAnalysis" && !reviewer) {
      assert.equal(String(input.batchId), "1");
      assert.equal(input.specificationId, "5");
      state.analysis = { id: "8", cycle: "1", revision: 1, createdAt: timestamp, createdBy: user.displayName,
        invalidatedAt: null, invalidationReason: null };
      addHistory(user, "analysis", "Análise iniciada");
      return { ok: true, data: "8" };
    }
    if (method === "addSample" && !reviewer) {
      assert.deepEqual(input, { analysisId: "8", identification: "Amostra QA" });
      state.samples = [{ id: "9", identification: input.identification }];
      return { ok: true, data: "9" };
    }
    if (method === "recordResult" && !reviewer) {
      if (recordError) return { ok: false, error: recordError };
      assert.deepEqual(input, { analysisId: "8", sampleId: "9", parameterId: "7", numericValue: "15.25", unit: "cP" });
      state.result = input.numericValue;
      addHistory(user, "result", "Resultado registrado", "Viscosidade · 15,25 cP");
      return { ok: true, data: "10" };
    }
    if (method === "submitReview" && !reviewer) {
      assert.deepEqual(input, { analysisId: "8" });
      assert.equal(state.result, "15.25");
      state.evaluation = { id: "12", outcome: "conforming", decision: null, stale: false,
        assessedBy: user.displayName, assessedAt: timestamp, decidedBy: null, decidedAt: null, reason: null };
      addHistory(user, "evaluation", "Enviada para revisão");
      return { ok: true, data: "12" };
    }
    if (method === "decideReview" && reviewer) {
      assert.deepEqual(input, { evaluationId: "12", decision: "approved", reason: "Conferência concluída" });
      state.evaluation = { ...state.evaluation, decision: "approved", decidedBy: user.displayName,
        decidedAt: timestamp, reason: input.reason };
      addHistory(user, "decision", "Análise aprovada", input.reason);
      return { ok: true, data: true };
    }
    return { ok: false, error: "Ação laboratorial não autorizada para esta sessão." };
  }
  return { handle, calls, state, failRecording: message => { recordError = message; } };
}

async function openDashboard(user, fixture, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("testLaboratoryCall", (method, input) => fixture.handle(user, method, input));
  await page.addInitScript(({ appVersion, user }) => {
    localStorage.setItem("portus:last-seen-version", appVersion);
    const batch = { id: 1, code: "LAB-QA-001", productId: 1, productName: "Caramelo QA", status: "open", completed: true,
      openedAt: "2026-11-24T12:00:00Z", operatorName: "Analista QA", readingsCount: 1 };
    const closedBatch = { ...batch, status: "closed", closedAt: "2026-11-24T14:00:00Z" };
    const getHistory = async () => ({ ok: true,
      data: { batch: closedBatch, sessions: [], auditEvents: [] } });
    const laboratory = Object.fromEntries(
      ["getBatch", "startAnalysis", "addSample", "recordResult", "recordCalculation", "submitReview", "decideReview"]
        .map(method => [method, input => window.testLaboratoryCall(method, input)])
    );
    window.api = {
      auth: { currentUser: async () => user, logout: async () => {} },
      setup: { status: async () => ({ configured: true, available: true, required: true,
        mode: "central", supported: true, setupCompleted: true }) },
      updates: { check: async () => null, verify: async () => ({ status: "current" }) },
      capture: { onEnded: () => () => {}, isActive: async () => false },
      users: { findByBarcode: async () => null },
      log: { error: async () => {} },
      central: { status: async () => ({ configured: true, available: true, required: true }),
        batches: { listOpen: async () => [batch], listAll: async () => [closedBatch] },
        history: { getBatch: getHistory } },
      history: { getBatch: getHistory },
      laboratory
    };
  }, { appVersion: version, user });
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Análise laboratorial", exact: true }).click({ timeout: 6000 });
  await page.getByRole("heading", { name: "Análise laboratorial" }).waitFor();
  return { page, errors };
}

test("lab operator captures a batch result and a distinct supervisor approves it", { timeout: 30000 }, async () => {
  const fixture = laboratoryFixture();
  const capture = await openDashboard(operator, fixture);
  try {
    const page = capture.page;
    await page.getByRole("button", { name: "Iniciar análise", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Lançar resultado" }).count(), 0,
      "an analysis without a sample must not offer a result editor");
    await page.getByLabel("Identificação da amostra").fill("Amostra QA");
    await page.getByRole("button", { name: "Adicionar amostra", exact: true }).click();
    await page.getByText("Viscosidade", { exact: true }).waitFor();
    await page.getByText(/Pendente|Incompleto/).first().waitFor();

    await page.getByRole("button", { name: "Lançar resultado" }).first().click();
    await page.getByRole("textbox", { name: /^Resultado/ }).fill("15,25");
    fixture.failRecording("Registro temporariamente indisponível.");
    await page.getByRole("button", { name: "Salvar resultado", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Registro temporariamente indisponível." }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: /^Resultado/ }).inputValue(), "15,25");
    fixture.failRecording(null);
    await page.getByRole("button", { name: "Salvar resultado", exact: true }).click();
    await page.getByText(/15[.,]25/).first().waitFor();
    await page.getByRole("button", { name: "Enviar para revisão", exact: true }).click();
    await page.getByText(/Aguardando (?:revisão|aprovação)|Em revisão/).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Aprovar análise", exact: true }).count(), 0);
    assert.deepEqual(capture.errors, []);
  } finally { await capture.page.close(); }

  const review = await openDashboard(supervisor, fixture, { width: 800, height: 900 });
  try {
    const page = review.page;
    await page.getByRole("button", { name: "Aprovar análise", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Lançar resultado" }).count(), 0);
    await page.getByLabel("Justificativa da decisão").fill("Conferência concluída");
    await page.getByRole("button", { name: "Aprovar análise", exact: true }).click();
    const history = page.getByRole("region", { name: "Histórico de revisões" });
    await history.getByText("Análise aprovada", { exact: true }).waitFor();
    await history.getByText("Conferência concluída", { exact: true }).waitFor();
    await history.getByText(/Supervisor QA/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Aprovar análise", exact: true }).count(), 0);
    assert.deepEqual(fixture.calls.filter(call => ["submitReview", "decideReview"].includes(call.method))
      .map(call => [call.user, call.method]), [[11, "submitReview"], [22, "decideReview"]]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "the compact view keeps horizontal overflow inside the result table");
    fixture.state.closed = true;
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await page.getByRole("button", { name: /LAB-QA-001/ }).click();
    await page.locator(".history-summary").getByText("FINALIZADO", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Análise laboratorial", exact: true }).click();
    const closedHistory = page.getByRole("region", { name: "Histórico de revisões" });
    await closedHistory.getByText("Análise aprovada", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Enviar para revisão", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Aprovar análise", exact: true }).count(), 0);
    assert.deepEqual(review.errors, []);
  } finally { await review.page.close(); }
});
