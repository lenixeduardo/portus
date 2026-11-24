import { ipcMain } from "electron";
import { z } from "zod";
import { IPC, type ServiceResult } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import { centralQuery } from "../db/central-connection";
import { requireAuth, validateInput } from "./middleware";

const id = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9][0-9]{0,18}$/).refine(
    value => value.length < 19 || value <= "9223372036854775807",
    "Identificador fora do intervalo do PostgreSQL."
  )
]);
const text = z.string().trim().min(1);
const decimal = z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/, "Informe um valor decimal.");
const analysis = { analysisId: id };
const measurement = { ...analysis, sampleId: id, parameterId: id, reason: text.optional() };
const recording = { ...measurement, readingId: id.optional() };
const resultSchema = z.union([
  z.strictObject({ ...recording, numericValue: decimal, unit: text }),
  z.strictObject({ ...recording, qualitativeValue: text })
]);

interface LaboratoryContext {
  application_id: string;
  sector_id: string;
}

function register<T, R>(
  channel: string,
  schema: z.ZodType<T>,
  operation: (input: T, actor: [number, string, string]) => Promise<R>
): void {
  const handler = requireAuth((event, payload: unknown, session: User | null) =>
    validateInput(schema)(async (_event, input): Promise<ServiceResult<R>> => {
      try {
        if (!session || getCurrentUser() !== session) throw new Error("Sessão alterada. Tente novamente.");
        const context = await centralQuery<LaboratoryContext>(
          `SELECT a.id AS application_id, s.id AS sector_id
             FROM public.applications a CROSS JOIN public.sectors s
            WHERE a.code = 'PORTUS_LABORATORY' AND a.active
              AND s.code = 'LABORATORY' AND s.active`
        );
        const row = context.rows[0];
        if (!row) throw new Error("Aplicação ou setor de Laboratório indisponível no PostgreSQL.");
        if (getCurrentUser() !== session) throw new Error("Sessão alterada. Tente novamente.");
        const data = await operation(input, [session.id, row.application_id, row.sector_id]);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Falha na operação laboratorial." };
      }
    })(event, payload)
  );
  ipcMain.handle(channel, (event, payload: unknown) => handler(event, payload, getCurrentUser()));
}

async function laboratoryId(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await centralQuery<{ id: string }>(sql, values);
  return rows[0].id;
}

export function registerLaboratoryHandlers(): void {
  register(IPC.laboratoryStartAnalysis, z.strictObject({ batchId: id, specificationId: id }),
    (input, actor) => laboratoryId("SELECT public.lab_start_analysis($1,$2,$3,$4,$5)::text AS id",
      [input.batchId, input.specificationId, ...actor]));

  register(IPC.laboratoryAddSample, z.strictObject({ ...analysis, identification: text }),
    (input, actor) => laboratoryId("SELECT public.lab_add_sample($1,$2,$3,$4,$5)::text AS id",
      [input.analysisId, input.identification, ...actor]));

  register(IPC.laboratoryRecordResult, resultSchema, (input, actor) => {
    const quantitative = "numericValue" in input;
    return laboratoryId("SELECT public.lab_record_result($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)::text AS id",
      [input.analysisId, input.sampleId, input.parameterId,
        quantitative ? input.numericValue : null, quantitative ? null : input.qualitativeValue,
        quantitative ? input.unit : null, input.readingId ?? null, ...actor, input.reason ?? null]);
  });

  register(IPC.laboratoryRecordCalculation, z.strictObject({
    ...measurement,
    formulaCode: z.string().regex(/^[a-z][a-z0-9_]*$/),
    formulaVersion: z.number().int().positive().max(2147483647),
    inputs: z.record(z.string().regex(/^[A-Z]+[1-9][0-9]*$/), z.strictObject({ value: decimal, unit: text }))
  }), (input, actor) => laboratoryId(
    // PostgreSQL constructs JSON numbers directly from decimal text without rounding in JavaScript.
    `SELECT public.lab_record_calculation($1,$2,$3,$4,$5,(
       SELECT COALESCE(jsonb_object_agg(cell, jsonb_build_object(
         'value', (entry->>'value')::numeric, 'unit', entry->>'unit')), '{}'::jsonb)
       FROM jsonb_each($6::jsonb) AS inputs(cell, entry)
     ),$7,$8,$9,$10)::text AS id`,
    [input.analysisId, input.sampleId, input.parameterId, input.formulaCode, input.formulaVersion,
      JSON.stringify(input.inputs), ...actor, input.reason ?? null]));

  register(IPC.laboratorySubmitReview, z.strictObject(analysis),
    (input, actor) => laboratoryId("SELECT public.lab_evaluate_conformity($1,$2,$3,$4)::text AS id",
      [input.analysisId, ...actor]));

  register(IPC.laboratoryDecideReview, z.strictObject({
    evaluationId: id, decision: z.enum(["approved", "rejected"]), reason: text
  }), async (input, actor) => {
    await centralQuery("SELECT public.lab_decide_conformity($1,$2,$3,$4,$5,$6)",
      [input.evaluationId, input.decision, input.reason, ...actor]);
    return true as const;
  });
}
