import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import type { ServiceResult } from "../../shared/ipc";
import type { LaboratoryBatchView, LaboratoryCalculationInput } from "../../shared/laboratory-ipc";
import type { User } from "../../shared/types";
import "./laboratory-batch.css";

export function canOpenLaboratory(user: User): boolean {
  return user.role === "master" || user.role === "supervisor" ||
    (user.role === "operator" && user.sectorCode === "LABORATORY");
}

type Parameter = LaboratoryBatchView["parameters"][number];
type Result = LaboratoryBatchView["results"][number];
type Mutation = (action: () => Promise<ServiceResult<unknown>>, message: string) => Promise<boolean>;

const outcomeLabels = {
  conforming: "Conforme",
  nonconforming: "Não conforme",
  incomplete: "Pendente",
  not_applicable: "Opcional"
};

function statusLabel(view: LaboratoryBatchView): string {
  if (!view.analysis) return view.specification ? "Análise não iniciada" : "Sem especificação vigente";
  if (view.analysis.invalidatedAt) return "Análise invalidada";
  if (view.evaluation?.stale) return "Reavaliação necessária";
  if (view.evaluation?.decision === "approved") return "Aprovada";
  if (view.evaluation?.decision === "rejected") return "Rejeitada";
  return view.evaluation ? "Aguardando revisão" : "Em lançamento";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function formatDecimal(value: string): string {
  return value.replace(".", ",");
}

function criterion(parameter: Parameter): string {
  if (parameter.qualitativeValue !== null) return parameter.qualitativeValue;
  const parts: string[] = [];
  if (parameter.minimum !== null) parts.push(`${parameter.minimumInclusive ? "≥" : ">"} ${formatDecimal(parameter.minimum)}`);
  if (parameter.maximum !== null) parts.push(`${parameter.maximumInclusive ? "≤" : "<"} ${formatDecimal(parameter.maximum)}`);
  return parts.length ? [...parts, parameter.unit].filter(Boolean).join(" ") : "Sem critério";
}

export function LaboratoryBatchPanel({ batchId, batchCode, onClose }: {
  batchId: number;
  batchCode: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const sampleField = useId();
  const reasonField = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [view, setView] = useState<LaboratoryBatchView>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [sampleName, setSampleName] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<{ sampleId: string; parameterId: string }>();
  const [confirmRevision, setConfirmRevision] = useState(false);

  async function refresh() {
    const request = ++generation.current;
    setLoading(true);
    setReadError("");
    try {
      const response = await window.api.laboratory.getBatch({ batchId });
      if (request !== generation.current) return;
      if (!response.ok) throw new Error(response.error);
      setView(response.data);
    } catch (error) {
      if (request === generation.current) setReadError(error instanceof Error ? error.message : "Não foi possível carregar a análise.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    void refresh();
    return () => { generation.current += 1; };
  }, [batchId]);

  const mutate: Mutation = async (action, message) => {
    if (inFlight.current) return false;
    const request = generation.current;
    inFlight.current = true;
    setBusy(true);
    setActionError("");
    setFeedback("");
    try {
      const response = await action();
      if (request !== generation.current) return false;
      if (!response.ok) throw new Error(response.error);
      setFeedback(message);
      await refresh();
      return true;
    } catch (error) {
      if (request === generation.current) setActionError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const analysis = view?.analysis;
  const evaluation = view?.evaluation;
  const specification = view?.analysisSpecification ?? view?.specification;
  const pending = view?.results.filter(result => result.outcome === "incomplete").length ?? 0;
  const nonconforming = view?.results.filter(result => result.outcome === "nonconforming").length ?? 0;
  const issueCount = [
    pending ? `${pending} ${pending === 1 ? "pendente" : "pendentes"}` : "",
    nonconforming ? `${nonconforming} ${nonconforming === 1 ? "não conforme" : "não conformes"}` : ""
  ].filter(Boolean).join(" · ");
  const locked = busy || loading || Boolean(readError);
  const api = window.api.laboratory;

  async function start() {
    if (!view?.specification) return;
    const specificationId = view.specification.id;
    if (await mutate(() => api.startAnalysis({ batchId, specificationId }), "Análise iniciada.")) {
      setEditing(undefined);
      setSampleName("");
      setReason("");
      setConfirmRevision(false);
    }
  }

  async function addSample(event: FormEvent) {
    event.preventDefault();
    if (analysis && await mutate(() => api.addSample({ analysisId: analysis.id, identification: sampleName.trim() }),
      "Amostra adicionada.")) setSampleName("");
  }

  async function decide(decision: "approved" | "rejected") {
    if (evaluation && await mutate(() => api.decideReview({ evaluationId: evaluation.id, decision, reason: reason.trim() }),
      decision === "approved" ? "Análise aprovada." : "Análise rejeitada.")) setReason("");
  }

  return (
    <section className="laboratory-panel" aria-labelledby={titleId} aria-busy={loading || busy}>
      <header className="laboratory-panel__header">
        <div>
          <h2 id={titleId} ref={heading} tabIndex={-1}><FlaskConical size={19} aria-hidden="true" /> Análise laboratorial</h2>
          <p className="muted">Lote #{batchCode}{view ? ` · Ciclo ${view.cycle}` : ""}{analysis ? ` · Revisão ${analysis.revision}` : ""}</p>
        </div>
        <div className="laboratory-actions">
          <button type="button" className="secondary" onClick={() => void refresh()} disabled={busy || loading}>
            <RefreshCw size={14} aria-hidden="true" /> Atualizar
          </button>
          <button type="button" className="secondary" onClick={onClose}>Fechar painel</button>
        </div>
      </header>

      {loading && <p className="muted" role="status">Carregando análise laboratorial…</p>}
      {readError && <p className="error" role="alert">{readError}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {feedback && <p className="success" role="status">{feedback}</p>}

      {view && <>
        <div className="laboratory-summary">
          <div><span>Estado da análise</span><strong>{statusLabel(view)}</strong></div>
          <div><span>Especificação</span><strong>{specification
            ? `${specification.modelCode} · v${specification.version}`
            : "Sem versão aprovada e vigente"}</strong></div>
          <div><span>Pendências</span><strong>{analysis
            ? !view.samples.length ? "Cadastre uma amostra" : issueCount || "Nenhuma pendência"
            : "—"}</strong></div>
        </div>

        {view.permissions.canStart && view.specification && (
          <div className="laboratory-actions">
            {analysis && !confirmRevision ? (
              <button type="button" className="secondary" disabled={locked} onClick={() => setConfirmRevision(true)}>
                Iniciar nova revisão
              </button>
            ) : (
              <button type="button" disabled={locked} onClick={() => void start()}>
                {analysis ? "Confirmar nova revisão" : "Iniciar análise"}
              </button>
            )}
            {confirmRevision && <>
              <span className="muted">A nova revisão terá suas próprias amostras e resultados.</span>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmRevision(false)}>Cancelar</button>
            </>}
          </div>
        )}
        {!analysis && !view.specification && <p className="muted">Cadastre e aprove uma especificação vigente para iniciar a análise deste produto.</p>}

        {analysis && <>
          <section className="laboratory-section" aria-label="Amostras e resultados">
            <h3>Amostras e resultados</h3>
            {view.permissions.canCapture && (
              <form className="laboratory-form" onSubmit={addSample}>
                <label htmlFor={sampleField}>Identificação da amostra
                  <input id={sampleField} required value={sampleName} onChange={event => setSampleName(event.target.value)} disabled={locked} />
                </label>
                <button type="submit" disabled={locked || !sampleName.trim()}>Adicionar amostra</button>
              </form>
            )}
            {view.samples.length === 0 && <p className="muted">Nenhuma amostra cadastrada.</p>}
            {view.samples.map(sample => (
              <section key={sample.id} className="laboratory-sample">
                <h4>{sample.identification}</h4>
                <ul>
                  {view.parameters.map(parameter => {
                    const result = view.results.find(row => row.sampleId === sample.id && row.parameterId === parameter.id);
                    const current = result?.id && !result.invalidatedAt;
                    const selected = editing?.sampleId === sample.id && editing.parameterId === parameter.id;
                    const canEdit = parameter.origin && (parameter.origin !== "calculated" || parameter.formula);
                    return (
                      <li key={parameter.id} className="laboratory-result">
                        <div className="laboratory-result__name">
                          <strong>{parameter.name}</strong>
                          <small>Critério · {criterion(parameter)}{parameter.required === true ? " · Obrigatório" : ""}</small>
                        </div>
                        <div className="laboratory-result__value">
                          <span>{current ? [result.numericValue !== null ? formatDecimal(result.numericValue) : result.qualitativeValue, result.unit].filter(Boolean).join(" ") : "Sem resultado"}</span>
                          <small>{result && outcomeLabels[result.outcome]}</small>
                        </div>
                        {view.permissions.canCapture && canEdit && (
                          <button type="button" className="secondary" disabled={locked}
                            onClick={() => { setActionError(""); setEditing({ sampleId: sample.id, parameterId: parameter.id }); }}>
                            {current ? "Corrigir resultado" : "Lançar resultado"}
                          </button>
                        )}
                        {parameter.origin === "calculated" && !parameter.formula && <small>Fórmula indisponível para lançamento</small>}
                        {selected && view.permissions.canCapture && (
                          <ResultForm key={`${sample.id}:${parameter.id}:${result?.revision ?? "novo"}`}
                            analysisId={analysis.id} sampleId={sample.id} parameter={parameter}
                            result={result} readings={view.readings} mutate={mutate} locked={locked}
                            onClose={() => setEditing(undefined)} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </section>

          <section className="laboratory-section" aria-label="Revisão">
            <h3>Revisão</h3>
            {evaluation && (
              <p>
                {outcomeLabels[evaluation.outcome]} · Avaliada em {formatDate(evaluation.assessedAt)}
                {evaluation.stale && " · Resultados alterados após a avaliação"}
              </p>
            )}
            {!evaluation && <p className="muted">A análise ainda não foi encaminhada para revisão.</p>}
            {evaluation?.reason && <p className="muted">Justificativa registrada · {evaluation.reason}</p>}
            {view.permissions.canSubmit && (!evaluation || evaluation.stale) && (
              <button type="button" disabled={locked || view.samples.length === 0}
                onClick={() => void mutate(() => api.submitReview({ analysisId: analysis.id }), "Análise encaminhada para revisão.")}>
                Enviar para revisão
              </button>
            )}
            {evaluation && !evaluation.decision && !evaluation.stale && !view.permissions.canReject && (
              <p className="muted">A decisão cabe a um revisor autorizado que não participou do lançamento.</p>
            )}
            {(view.permissions.canApprove || view.permissions.canReject) && (
              <div className="laboratory-form">
                <label htmlFor={reasonField}>Justificativa da decisão
                  <input id={reasonField} value={reason} onChange={event => setReason(event.target.value)} disabled={locked} />
                </label>
                <div className="laboratory-actions">
                {view.permissions.canApprove && <button type="button" disabled={locked || !reason.trim()}
                  onClick={() => void decide("approved")}>Aprovar análise</button>}
                {view.permissions.canReject && <button type="button" className="secondary" disabled={locked || !reason.trim()}
                  onClick={() => void decide("rejected")}>Rejeitar análise</button>}
                </div>
              </div>
            )}
          </section>
        </>}

        <section className="laboratory-section" aria-label="Histórico de revisões">
          <h3>Histórico de revisões</h3>
          {!view.history.length ? <p className="muted">Nenhuma revisão registrada.</p> : (
            <ol className="laboratory-history">
              {view.history.map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <div><strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}</div>
                  <small>Ciclo {item.cycle} · Revisão {item.analysisRevision} · {item.actor} · {formatDate(item.createdAt)}</small>
                </li>
              ))}
            </ol>
          )}
        </section>
      </>}
    </section>
  );
}

function ResultForm({ analysisId, sampleId, parameter, result, readings, locked, mutate, onClose }: {
  analysisId: string;
  sampleId: string;
  parameter: Parameter;
  result?: Result;
  readings: LaboratoryBatchView["readings"];
  locked: boolean;
  mutate: Mutation;
  onClose: () => void;
}) {
  const [value, setValue] = useState(result?.numericValue ?? result?.qualitativeValue ?? "");
  const [readingId, setReadingId] = useState(result?.readingId ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const { formula, origin } = parameter;
  const options = readings.filter(reading => !parameter.equipmentId || reading.equipmentId === parameter.equipmentId);
  const reading = options.find(entry => entry.id === readingId);
  const decimal = (input: string) => input.trim().replace(",", ".");
  const entered = (origin === "instrumental" ? reading?.value : value)?.trim() ?? "";
  const ready = formula ? formula.inputs.every(input => Boolean(inputs[input.cell]?.trim())) : Boolean(entered);
  const valid = ready && (!result?.id || Boolean(reason.trim()));
  const api = window.api.laboratory;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || locked) return;
    const measurement = {
      analysisId, sampleId, parameterId: parameter.id,
      ...(result?.id ? { reason: reason.trim() } : {})
    };
    const action = formula ? () => {
      const values: LaboratoryCalculationInput["inputs"] = Object.fromEntries(
        formula.inputs.map(input => [input.cell, { value: decimal(inputs[input.cell]), unit: input.unit }])
      );
      return api.recordCalculation({ ...measurement, formulaCode: formula.code, formulaVersion: formula.version, inputs: values });
    } : () => {
      const provenance = reading ? { readingId: reading.id } : {};
      return parameter.valueType === "quantitative"
        ? api.recordResult({ ...measurement, ...provenance, numericValue: decimal(entered), unit: parameter.unit ?? "" })
        : api.recordResult({ ...measurement, ...provenance, qualitativeValue: entered });
    };
    if (await mutate(action, "Resultado registrado.")) onClose();
  }

  return (
    <form className="laboratory-form laboratory-result-editor" onSubmit={save} aria-label={`Lançamento de ${parameter.name}`}>
      {formula ? formula.inputs.map(input => (
        <label key={input.cell}>{input.description} · {input.unit}
          <input inputMode="decimal" required value={inputs[input.cell] ?? ""} disabled={locked}
            onChange={event => setInputs(values => ({ ...values, [input.cell]: event.target.value }))} />
        </label>
      )) : origin === "instrumental" ? (
        <label>Leitura instrumental
          <select required value={readingId} disabled={locked || !options.length} onChange={event => setReadingId(event.target.value)}>
            <option value="">{options.length ? "Selecione uma leitura do lote" : "Nenhuma leitura compatível disponível"}</option>
            {options.map(entry => <option key={entry.id} value={entry.id}>
              {entry.equipmentName} · {entry.value} · {formatDate(entry.capturedAt)}
            </option>)}
          </select>
        </label>
      ) : (
        <label>Resultado{parameter.unit && <small> · {parameter.unit}</small>}
          <input aria-label="Resultado" required inputMode={parameter.valueType === "quantitative" ? "decimal" : "text"}
            value={value} onChange={event => setValue(event.target.value)} disabled={locked} />
        </label>
      )}
      {result?.id && <label>Justificativa da correção
        <input required value={reason} onChange={event => setReason(event.target.value)} disabled={locked} />
      </label>}
      <button type="submit" disabled={!valid || locked}>Salvar resultado</button>
      <button type="button" className="secondary" disabled={locked} onClick={onClose}>Cancelar lançamento</button>
    </form>
  );
}
