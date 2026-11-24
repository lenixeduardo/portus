import { Client } from "pg";
import type { LaboratoryBatchView } from "../../shared/laboratory-ipc";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  routes: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  getCurrentUser: vi.fn(),
  query: vi.fn(),
  logout: vi.fn(),
  invoke: vi.fn(),
  expose: vi.fn()
}));
vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, handler: never) => fixture.routes.set(name, handler) },
  ipcRenderer: { invoke: fixture.invoke },
  contextBridge: { exposeInMainWorld: fixture.expose }
}));
vi.mock("../auth/auth-service", () => ({
  getCurrentUser: fixture.getCurrentUser, touchSession: vi.fn(), logout: fixture.logout
}));
vi.mock("../db/central-connection", () => ({ centralQuery: fixture.query }));
vi.mock("../update-gate", () => ({ assertUpdateGateOpen: vi.fn() }));

const session = { id: 7, role: "operator", sectorCode: "LABORATORY" };
const call = (channel: string, payload: unknown) => fixture.routes.get("laboratory:" + channel)!({}, payload);

beforeEach(async () => {
  vi.clearAllMocks();
  fixture.routes.clear();
  fixture.getCurrentUser.mockReturnValue(session);
  fixture.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users")) return { rows: [{ id: "7", role: "operator", sector_code: "LABORATORY" }] };
    if (sql.includes("FROM public.applications")) return { rows: [{ application_id: "2", sector_id: "3" }] };
    return { rows: [{ id: "42" }] };
  });
  const { registerLaboratoryHandlers } = await import("../ipc/laboratory-handlers");
  registerLaboratoryHandlers();
});

describe("laboratory IPC", () => {
  it.each([
    ["start-analysis", "lab_start_analysis", { batchId: 20, specificationId: "21" }, [20, "21", 7, "2", "3"]],
    ["add-sample", "lab_add_sample", { analysisId: "42", identification: " A " }, ["42", "A", 7, "2", "3"]],
    ["record-result", "lab_record_result", { analysisId: "42", sampleId: "43", parameterId: "44", numericValue: "0.123456789012345678", unit: "Abs" }, ["42", "43", "44", "0.123456789012345678", null, "Abs", null, 7, "2", "3", null]],
    ["record-result", "lab_record_result", { analysisId: "42", sampleId: "43", parameterId: "44", qualitativeValue: "Ausente", readingId: 50 }, ["42", "43", "44", null, "Ausente", null, 50, 7, "2", "3", null]],
    ["record-calculation", "lab_record_calculation", { analysisId: "42", sampleId: "43", parameterId: "44", formulaCode: "cor_spencer", formulaVersion: 1, inputs: { B3: { value: "0.6", unit: "Abs" } } }, ["42", "43", "44", "cor_spencer", 1, '{"B3":{"value":"0.6","unit":"Abs"}}', 7, "2", "3", null]],
    ["submit-review", "lab_evaluate_conformity", { analysisId: "42" }, ["42", 7, "2", "3"]]
  ])("routes %s through PostgreSQL with the session identity", async (channel, fn, payload, params) => {
    await expect(call(channel, payload)).resolves.toEqual({ ok: true, data: "42" });
    expect(fixture.query).toHaveBeenLastCalledWith(expect.stringContaining("public." + fn), params);
  });

  it("loads only the batch selected by the renderer, with the actor from the session", async () => {
    const view = { cycle: "1", analysis: null };
    fixture.query
      .mockResolvedValueOnce({ rows: [{ id: "7", role: "operator", sector_code: "LABORATORY" }] })
      .mockResolvedValueOnce({ rows: [{ application_id: "2", sector_id: "3" }] })
      .mockResolvedValueOnce({ rows: [{ view }] });
    await expect(call("get-batch", { batchId: 20 })).resolves.toEqual({ ok: true, data: view });
    expect(fixture.query).toHaveBeenLastCalledWith(
      expect.stringContaining("public.lab_get_batch_view"), [20, 7, "2", "3"]
    );
  });

  it("rejects renderer-supplied actor data before a laboratory write", async () => {
    await expect(call("start-analysis", { batchId: 20, specificationId: 21, userId: 8 }))
      .rejects.toThrow();
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthenticated caller and a session revoked in PostgreSQL", async () => {
    fixture.getCurrentUser.mockReturnValueOnce(null).mockReturnValueOnce(null);
    await expect(call("submit-review", { analysisId: 42 })).rejects.toThrow("Não autenticado");
    expect(fixture.query).not.toHaveBeenCalled();
    fixture.query.mockResolvedValueOnce({ rows: [] });
    await expect(call("submit-review", { analysisId: 42 })).rejects.toThrow("Sessão revogada");
    expect(fixture.logout).toHaveBeenCalledOnce();
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it("does not execute a laboratory write after logout during context lookup", async () => {
    fixture.getCurrentUser.mockReturnValueOnce(session).mockReturnValueOnce(session).mockReturnValueOnce(session).mockReturnValueOnce(null);
    await expect(call("submit-review", { analysisId: 42 })).resolves.toMatchObject({ ok: false });
    expect(fixture.query).toHaveBeenCalledTimes(2);
  });

  it("preserves database rejection for an invalid instrument link", async () => {
    fixture.query.mockImplementationOnce(async () => ({ rows: [{ role: "operator", sector_code: "LABORATORY" }] }))
      .mockResolvedValueOnce({ rows: [{ application_id: "2", sector_id: "3" }] })
      .mockRejectedValueOnce(new Error("Instrument reading belongs to a different batch or session"));
    await expect(call("record-result", { analysisId: 42, sampleId: 43, parameterId: 44, numericValue: "1", unit: "Abs", readingId: 100 }))
      .resolves.toEqual({ ok: false, error: "Instrument reading belongs to a different batch or session" });
  });

  it("uses the authenticated reviewer and passes the decision to PostgreSQL", async () => {
    const reviewer = { id: 9, role: "supervisor", sectorCode: "ADMIN" };
    fixture.getCurrentUser.mockReturnValue(reviewer);
    fixture.query.mockResolvedValueOnce({ rows: [{ role: "supervisor", sector_code: "ADMIN" }] });
    await expect(call("decide-review", { evaluationId: "42", decision: "approved", reason: " Critérios atendidos " }))
      .resolves.toEqual({ ok: true, data: true });
    expect(fixture.query).toHaveBeenLastCalledWith(expect.stringContaining("public.lab_decide_conformity"),
      ["42", "approved", "Critérios atendidos", 9, "2", "3"]);
  });

  it("registers typed laboratory calls on the isolated preload bridge", async () => {
    await import("../../preload/index");
    const [, api] = fixture.expose.mock.calls[0];
    await api.laboratory.submitReview({ analysisId: "42" });
    expect(fixture.invoke).toHaveBeenCalledWith("laboratory:submit-review", { analysisId: "42" });
  });
});


const testDatabase = process.env.PORTUS_EPA_IPC_TEST_DATABASE_URL;
it.skipIf(!testDatabase)("runs the IPC flow against PostgreSQL with distinct authenticated actors", async () => {
  const db = new Client({ connectionString: testDatabase, options: "-c search_path=public" });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(`
      CREATE TEMP TABLE ipc_lab_fixture (
        actor bigint, reviewer bigint, batch bigint, specification bigint, parameter bigint,
        manual_parameter bigint, instrument_parameter bigint, reading bigint
      );
      DO $$
      DECLARE
        actor bigint; reviewer bigint; batch bigint; product bigint; specification bigint;
        parameter bigint; template bigint; revision bigint; app bigint; sector bigint;
        manual_parameter bigint; instrument_parameter bigint; equipment bigint; capture bigint; reading bigint;
      BEGIN
        SELECT id INTO STRICT app FROM applications WHERE code = 'PORTUS_LABORATORY';
        SELECT id INTO STRICT sector FROM sectors WHERE code = 'LABORATORY';
        INSERT INTO users(username, display_name, password_hash, role)
          VALUES ('qa_epa_ipc', 'QA EPA IPC', 'unused', 'master') RETURNING id INTO actor;
        INSERT INTO users(username, display_name, password_hash, role)
          VALUES ('qa_epa_ipc_reviewer', 'QA EPA IPC Reviewer', 'unused', 'master') RETURNING id INTO reviewer;
        INSERT INTO products(name, created_by) VALUES ('QA EPA IPC', actor) RETURNING id INTO product;
        INSERT INTO batches(product_id, code, created_by)
          VALUES (product, 'QA-EPA-IPC', actor) RETURNING id INTO batch;
        INSERT INTO equipments(code, name) VALUES ('QA-EPA-IPC', 'QA instrument') RETURNING id INTO equipment;
        INSERT INTO capture_sessions(batch_id, timeout_seconds) VALUES (batch, 10) RETURNING id INTO capture;
        INSERT INTO readings(batch_id, equipment_id, capture_session_id, value_raw, value_parsed)
          VALUES (batch, equipment, capture, 'QA:5,2', '5,2') RETURNING id INTO reading;
        INSERT INTO lab_templates(code) VALUES ('QA-EPA-IPC') RETURNING id INTO template;
        INSERT INTO lab_template_versions(template_id, version, source_document)
          VALUES (template, 1, 'QA fixture') RETURNING id INTO revision;
        SELECT id INTO STRICT parameter FROM lab_parameters WHERE code = 'cor_spencer';
        INSERT INTO lab_template_parameters(template_version_id, parameter_id, original_name, value_type,
            origin, unit, required, source_evidence, formula_code, formula_version)
          VALUES (revision, parameter, 'Cor Spencer', 'quantitative', 'calculated', '1', true,
            'QA fixture', 'cor_spencer', 1);
        INSERT INTO lab_parameters(code, name) VALUES ('qa_epa_ipc_manual', 'QA manual')
          RETURNING id INTO manual_parameter;
        INSERT INTO lab_parameters(code, name) VALUES ('qa_epa_ipc_instrument', 'QA instrument')
          RETURNING id INTO instrument_parameter;
        INSERT INTO lab_template_parameters(template_version_id, parameter_id, original_name, value_type,
            origin, unit, required, source_evidence, equipment_id)
          VALUES (revision, manual_parameter, 'QA manual', 'qualitative', 'manual', NULL, true, 'QA fixture', NULL),
                 (revision, instrument_parameter, 'QA instrument', 'quantitative', 'instrumental', 'mg/L',
                    true, 'QA fixture', equipment);
        PERFORM lab_approve_template(revision, reviewer, app, sector);
        INSERT INTO lab_product_specifications(product_id, template_version_id)
          VALUES (product, revision) RETURNING id INTO specification;
        INSERT INTO lab_spec_limits(specification_id, template_version_id, parameter_id, value_type, unit,
            minimum_value, maximum_value, source_evidence)
          VALUES (specification, revision, parameter, 'quantitative', '1', 120, 130, 'QA fixture');
        INSERT INTO lab_spec_limits(specification_id, template_version_id, parameter_id, value_type, unit,
            minimum_value, qualitative_value, source_evidence)
          VALUES (specification, revision, manual_parameter, 'qualitative', NULL, NULL, 'Ausente', 'QA fixture'),
                 (specification, revision, instrument_parameter, 'quantitative', 'mg/L', 5, NULL, 'QA fixture');
        PERFORM lab_approve_specification(specification, reviewer, app, sector);
        INSERT INTO ipc_lab_fixture
          VALUES (actor, reviewer, batch, specification, parameter, manual_parameter, instrument_parameter, reading);
      END;
      $$;
    `);
    const { rows: [ids] } = await db.query("SELECT * FROM ipc_lab_fixture");
    await db.query(`
      CREATE ROLE qa_epa_ipc_runtime NOLOGIN;
      GRANT USAGE ON SCHEMA public TO qa_epa_ipc_runtime;
      GRANT SELECT ON public.users, public.applications, public.sectors TO qa_epa_ipc_runtime;
      SELECT public.lab_grant_runtime('qa_epa_ipc_runtime');
      SET LOCAL ROLE qa_epa_ipc_runtime;
    `);
    const sessionFor = (id: string) => ({ id: Number(id), role: "master", sectorCode: "ADMIN" });
    fixture.getCurrentUser.mockReturnValue(sessionFor(ids.actor));
    fixture.query.mockImplementation((sql: string, params?: unknown[]) => db.query(sql, params));
    async function invokeId(channel: string, payload: unknown): Promise<string> {
      const response = await call(channel, payload);
      expect(response).toMatchObject({ ok: true, data: expect.any(String) });
      return (response as { data: string }).data;
    }

    async function readBatch(): Promise<LaboratoryBatchView> {
      const response = await call("get-batch", { batchId: ids.batch });
      expect(response).toMatchObject({ ok: true });
      return (response as { data: LaboratoryBatchView }).data;
    }

    const privileges = await db.query(`SELECT has_table_privilege('public.lab_results','SELECT') AS can_read_table,
      has_function_privilege('public.lab_get_batch_view(bigint,bigint,bigint,bigint)','EXECUTE') AS can_read_view`);
    expect(privileges.rows[0]).toEqual({ can_read_table: false, can_read_view: true });
    expect(await readBatch()).toMatchObject({
      cycle: "1", specification: { id: ids.specification, modelCode: "QA-EPA-IPC", version: 1 },
      analysis: null, outcome: null, permissions: {
        canStart: true, canCapture: false, canSubmit: false, canApprove: false, canReject: false
      }
    });

    const analysisId = await invokeId("start-analysis", { batchId: ids.batch, specificationId: ids.specification });
    const sampleId = await invokeId("add-sample", { analysisId, identification: "A" });
    const pending = await readBatch();
    expect(pending.analysisSpecification?.id).toBe(ids.specification);
    expect(pending.readings).toEqual([expect.objectContaining({ id: ids.reading, value: "5,2" })]);
    expect(pending.results).toHaveLength(3);
    expect(pending.results.every(result => result.id === null && result.outcome === "incomplete")).toBe(true);
    expect(pending.parameters.find(parameter => parameter.id === ids.parameter)).toMatchObject({
      minimum: "120", maximum: "130",
      formula: { code: "cor_spencer", version: 1, inputs: [{ cell: "B3", unit: "Abs" }] }
    });

    const resultId = await invokeId("record-calculation", {
      analysisId, sampleId, parameterId: ids.parameter, formulaCode: "cor_spencer",
      formulaVersion: 1, inputs: { B3: { value: "0.600000000000000001", unit: "Abs" } }
    });
    await invokeId("record-result", { analysisId, sampleId, parameterId: ids.manual_parameter, qualitativeValue: "Ausente" });
    await invokeId("record-result", {
      analysisId, sampleId, parameterId: ids.instrument_parameter, readingId: ids.reading, numericValue: "5.2", unit: "mg/L"
    });
    const staleEvaluationId = await invokeId("submit-review", { analysisId });
    await invokeId("record-result", {
      analysisId, sampleId, parameterId: ids.manual_parameter, qualitativeValue: "Ausente", reason: "Conferência"
    });
    fixture.getCurrentUser.mockReturnValue(sessionFor(ids.reviewer));
    expect(await readBatch()).toMatchObject({
      evaluation: { id: staleEvaluationId, stale: true },
      permissions: { canApprove: false, canReject: false }
    });
    fixture.getCurrentUser.mockReturnValue(sessionFor(ids.actor));
    const evaluationId = await invokeId("submit-review", { analysisId });
    expect(await readBatch()).toMatchObject({
      evaluation: { id: evaluationId, stale: false, decision: null, outcome: "conforming" },
      permissions: { canApprove: false, canReject: false }
    });
    const decision = { evaluationId, decision: "approved", reason: "QA" };
    // PostgreSQL errors abort their current transaction scope.
    await db.query("SAVEPOINT self_review");
    await expect(call("decide-review", decision)).resolves.toMatchObject({ ok: false });
    await db.query("ROLLBACK TO SAVEPOINT self_review");
    fixture.getCurrentUser.mockReturnValue(sessionFor(ids.reviewer));
    expect(await readBatch()).toMatchObject({ permissions: { canApprove: true, canReject: true } });
    await expect(call("decide-review", decision)).resolves.toEqual({ ok: true, data: true });
    const approved = await readBatch();
    expect(approved).toMatchObject({
      evaluation: { id: evaluationId, stale: false, decision: "approved", decidedBy: "QA EPA IPC Reviewer" },
      permissions: { canApprove: false, canReject: false }
    });
    expect(approved.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "analysis", actor: "QA EPA IPC" }),
      expect.objectContaining({ kind: "result", detail: expect.stringContaining("Conferência") }),
      expect.objectContaining({ kind: "decision", actor: "QA EPA IPC Reviewer", detail: "QA" })
    ]));
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
    await db.query("RESET ROLE");
    const evidence = await db.query("SELECT inputs #>> '{B3,value}' AS input FROM lab_calculation_evidence WHERE result_id=$1", [resultId]);
    expect(evidence.rows[0].input).toBe("0.600000000000000001");
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
