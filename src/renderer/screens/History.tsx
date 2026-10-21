import React, { useEffect, useState, useMemo } from "react";
import { Printer, RotateCcw } from "lucide-react";
import type { BatchWithProduct, BatchHistory, CaptureSessionRecord } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { canReopenFinalizedBatch } from "../../shared/batch-permissions";
import { Modal } from "../components/Modal";

export function History({ user }: { user: User }) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [batchSearch, setBatchSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [history, setHistory] = useState<BatchHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenJustification, setReopenJustification] = useState("");
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [centralMode, setCentralMode] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const [filterEquipment, setFilterEquipment] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  useEffect(() => {
    window.api.central.status().then((status) => {
      const requiresCentral = status.required || status.configured || user.sectorCode === "LABORATORY";
      setCentralMode(requiresCentral);
      if (requiresCentral && !status.available) {
        setError("O PostgreSQL central é obrigatório e está indisponível. Verifique a configuração e tente novamente.");
        return [];
      }
      return requiresCentral ? window.api.central.batches.listAll() : window.api.batches.listAll();
    }).then(setBatches).catch(() => {
      setError("Não foi possível consultar o histórico na base central.");
      setBatches([]);
    });
  }, [user.sectorCode]);

  useEffect(() => {
    setFilterEquipment("");
    setFilterStartDate("");
    setFilterEndDate("");

    let active = true;
    if (!selectedId) {
      setHistory(null);
      setError(null);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    setHistory(null);
    const historyRequest = centralMode
      ? window.api.central.history.getBatch(Number(selectedId))
      : window.api.history.getBatch(Number(selectedId));
    void historyRequest.then((res) => {
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistory(res.data);
    }).catch((error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : "Falha ao consultar histórico.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [selectedId, centralMode]);

  const matchingBatches = useMemo(() => batches.filter(batch => !batchSearch || batch.code.slice(-4).includes(batchSearch)), [batches, batchSearch]);

  const uniqueEquipments = useMemo(() => {
    if (!history) return [];
    const eqMap = new Map<number, string>();
    for (const session of history.sessions) {
      for (const r of session.readings) eqMap.set(r.equipmentId, r.equipmentName);
    }
    return Array.from(eqMap.entries());
  }, [history]);

  const filteredSessions = useMemo(() => {
    if (!history) return [];
    const hasFilters = !!(filterEquipment || filterStartDate || filterEndDate);

    return history.sessions
      .map((session) => {
        const filteredReadings = session.readings.filter((r) => {
          if (filterEquipment && r.equipmentId !== Number(filterEquipment)) return false;
          const rDate = parseHistoryDate(r.capturedAt);
          if (!rDate) return false;
          if (filterStartDate) {
            const start = new Date(filterStartDate + "T00:00:00");
            if (rDate < start) return false;
          }
          if (filterEndDate) {
            const end = new Date(filterEndDate + "T23:59:59");
            if (rDate > end) return false;
          }
          return true;
        });
        return { ...session, readings: filteredReadings };
      })
      .filter((session) => !hasFilters || session.readings.length > 0);
  }, [history, filterEquipment, filterStartDate, filterEndDate]);

  const totalReadings = filteredSessions.reduce((acc, s) => acc + s.readings.length, 0);
  const unifiedReadings = useMemo(() => filteredSessions.flatMap((session) =>
    session.readings.map((reading) => ({
      reading,
      session,
      sessionNumber: history ? history.sessions.findIndex((item) => item.id === session.id) + 1 : 0
    }))
  ), [filteredSessions, history]);

  async function handleExport(format: "xlsx" | "pdf") {
    if (!selectedId) return;
    setExporting(true);
    setExportMsg(null);

    const filters = {
      equipmentId: filterEquipment ? Number(filterEquipment) : undefined,
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined
    };

    setReportMenuOpen(false);
    try {
      const res = format === "pdf"
        ? await window.api.history.exportPdf(Number(selectedId))
        : await window.api.history.exportCsv(Number(selectedId), filters);
      if (!res.ok) {
        if (res.error !== "Exportação cancelada.") setError(res.error);
      } else {
        setExportMsg(format === "pdf" ? "Relatório PDF salvo com sucesso." : "Relatório Excel (.xlsx) salvo com sucesso.");
        setTimeout(() => setExportMsg(null), 4000);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao exportar relatório.");
    } finally {
      setExporting(false);
    }
  }

  function openReopenDialog() {
    if (!selectedId || !history || history.batch.status !== "closed" ||
        !canReopenFinalizedBatch(user.role) || reopening) return;
    setReopenJustification("");
    setError(null);
    setReopenDialogOpen(true);
  }

  async function handleReopen() {
    if (!selectedId || !history || history.batch.status !== "closed" ||
        !canReopenFinalizedBatch(user.role) || reopening) return;

    const justification = reopenJustification.trim();
    if (justification.length > 1000 || (justification.length > 0 && justification.length < 10)) {
      setError("Informe uma justificativa entre 10 e 1000 caracteres para reabrir o lote.");
      return;
    }

    const batchId = Number(selectedId);
    setReopening(true);
    setError(null);

    try {
      const res = await window.api.central.batches.reopen(batchId, justification);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      // O banco já confirmou a reabertura. Uma falha de atualização visual
      // não deve ocultar essa confirmação nem produzir rejeição não tratada.
      const refreshed = await window.api.central.history.getBatch(batchId).catch(() => null);
      if (refreshed?.ok) {
        setHistory(refreshed.data);
      } else {
        setHistory((current) => current ? { ...current, batch: res.data } : current);
      }
      setBatches((current) => current.map((batch) => batch.id === res.data.id ? res.data : batch));
      setReopenDialogOpen(false);
      setReopenJustification("");
      setExportMsg("Lote reaberto. Novas análises podem ser registradas antes de uma nova conclusão e finalização.");
      setTimeout(() => setExportMsg(null), 5000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível reabrir o lote.");
    } finally {
      setReopening(false);
    }
  }

  async function handlePrint() {
    if (!selectedId) return;
    setPrinting(true);
    setError(null);
    try {
      const res = await window.api.history.printBatch(Number(selectedId));
      if (!res.ok) setError(res.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao abrir a pré-visualização do relatório.");
    } finally {
      setPrinting(false);
    }
  }

  const isAnyFilterActive = !!(filterEquipment || filterStartDate || filterEndDate);
  const canReopenBatch = canReopenFinalizedBatch(user.role);

  return (
    <>
      <div className="history-toolbar">
        <div className="batch-picker">
          <div className="field" style={{ padding: 8 }}>
            <label htmlFor="history-batch-search">Buscar pelos 4 últimos dígitos do lote</label>
            <input id="history-batch-search" inputMode="numeric" maxLength={4} value={batchSearch} onChange={event => setBatchSearch(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Ex.: 1234" aria-label="Buscar lote no histórico pelos quatro últimos dígitos" />
          </div>
          {batches.length === 0 ? (
            <div className="batch-picker-item" style={{ color: "var(--text-faint)", cursor: "default" }}>
              Nenhum lote cadastrado
            </div>
          ) : (
            matchingBatches.map((b) => (
              <button
                key={b.id}
                className={`batch-picker-item${selectedId === b.id ? " batch-picker-item--selected" : ""}`}
                disabled={reopening}
                onClick={() => setSelectedId(selectedId === b.id ? "" : b.id)}
              >
                <span className="batch-picker-code" title={b.code}>#{b.code}</span>
                <span className="batch-picker-name" title={b.productName}>{b.productName}</span>
                <span className={`chip ${b.status === "closed" ? "chip-gray" : b.completed ? "chip-blue" : "chip-green"}`}>
                  {b.status === "closed" ? "FINALIZADO" : b.completed ? "CONCLUÍDO" : "ABERTO"}
                </span>
              </button>
            ))
          )}
        </div>

        {history && (
          <div className="history-toolbar-actions">
            {canReopenBatch && centralMode && history.batch.status === "closed" && (
              <button type="button" onClick={openReopenDialog} disabled={reopening} className="secondary history-reopen-btn">
                <RotateCcw size={15} aria-hidden="true" />
                {reopening ? "Reabrindo..." : "Reabrir lote"}
              </button>
            )}
            <button onClick={handlePrint} disabled={printing} className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Printer size={15} aria-hidden="true" />
              {printing ? "Imprimindo..." : "Imprimir folha"}
            </button>
            <div className="report-export-actions">
              <button type="button" onClick={() => setReportMenuOpen((value) => !value)} disabled={exporting} className="export-btn" aria-expanded={reportMenuOpen} aria-haspopup="menu">
                {exporting ? "Exportando..." : "Exportar relatório"}
              </button>
              {reportMenuOpen && (
                <div className="report-export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void handleExport("pdf")}>Salvar PDF (.pdf)</button>
                  <button type="button" role="menuitem" onClick={() => void handleExport("xlsx")}>Salvar Excel (.xlsx)</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {exportMsg && <div className="success" style={{ marginTop: 12 }}>{exportMsg}</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      {loading && <div className="muted" style={{ marginTop: 16 }}>Carregando histórico...</div>}

      {!selectedId && !loading && (
        <div className="placeholder" style={{ marginTop: 16 }}>
          Selecione um lote acima para visualizar o histórico de capturas.
        </div>
      )}

      {history && !loading && (
        <>
          <div className="history-summary">
            <div className="history-summary-item"><span>Produto</span><strong>{history.batch.productName}</strong></div>
            <div className="history-summary-item"><span>Código</span><strong>#{history.batch.code}</strong></div>
            <div className="history-summary-item"><span>Operador</span><strong>{history.batch.operatorName}</strong></div>
            <div className="history-summary-item"><span>Abertura</span><strong>{formatDate(history.batch.openedAt)}</strong></div>
            <div className="history-summary-item">
              <span>Status</span>
              <strong><span className={`chip ${history.batch.status === "open" ? "chip-green" : "chip-gray"}`}>
                {history.batch.status === "closed" ? "FINALIZADO" : history.batch.completed ? "CONCLUÍDO" : "ABERTO"}
              </span></strong>
            </div>
            <div className="history-summary-item"><span>Total leituras</span><strong>{totalReadings}</strong></div>
          </div>

          {history.auditEvents && history.auditEvents.length > 0 && (
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <strong>Linha do tempo do lote</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {history.auditEvents
                  .filter((event) => auditLabel(event.action))
                  .map((event) => (
                    <div key={event.id} style={{ display: "grid", gridTemplateColumns: "170px 1fr 220px minmax(150px, 1fr)", gap: 12, alignItems: "center" }}>
                      <span className="mono muted">{formatDate(event.timestamp)}</span>
                      <strong>{auditLabel(event.action)}</strong>
                      <span>{event.actorName ?? event.actorLogin ?? "—"}{event.actorLogin && event.actorName !== event.actorLogin ? ` · ${event.actorLogin}` : ""}</span>
                      <span className="mono muted">{["BATCH_FINALIZED", "BATCH_CLOSED", "MASTER_BATCH_CLOSED"].includes(event.action) ? (event.stationCode ? `Máquina: ${event.stationCode}` : "Máquina: não registrada") : ""}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="history-filters">
            <div className="field">
              <label>Equipamento</label>
              <select value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}>
                <option value="">Todos os equipamentos</option>
                {uniqueEquipments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Data Inicial</label>
              <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Data Final</label>
              <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
            </div>
            {isAnyFilterActive && (
              <div className="history-filters-actions">
                <button className="secondary" style={{ height: 38, padding: "0 16px" }} onClick={() => {
                  setFilterEquipment(""); setFilterStartDate(""); setFilterEndDate("");
                }}>Limpar</button>
              </div>
            )}
          </div>

          {history.sessions.length === 0 ? (
            <div className="placeholder" style={{ marginTop: 16 }}>Nenhuma sessão de captura registrada neste lote.</div>
          ) : unifiedReadings.length === 0 ? (
            <div className="placeholder" style={{ marginTop: 16 }}>Nenhum registro corresponde aos filtros aplicados.</div>
          ) : (
            <div className="history-unified-table-wrap">
              <table className="data-table history-unified-table">
                <thead><tr>
                  <th>Setor</th><th>Sessão</th><th>Responsável</th><th>Login</th><th>Computador</th><th>Equipamento</th>
                  <th>Canal</th><th>Valor capturado</th><th>Valor bruto</th><th>Data e hora</th>
                </tr></thead>
                <tbody>
                  {unifiedReadings.map(({ reading, session, sessionNumber }) => (
                    <tr key={reading.id}>
                      <td><SectorChip sectorCode={session.sectorCode} /></td>
                      <td className="mono">#{sessionNumber}</td>
                      <td>{session.operatorName ?? session.operatorLogin ?? "—"}</td>
                      <td className="mono">{session.operatorLogin ?? "—"}</td>
                      <td className="mono">{session.stationCode ?? "—"}</td>
                      <td>{reading.equipmentName}</td>
                      <td>{reading.slotIndex >= 0 ? `Slot ${reading.slotIndex + 1}` : "—"}</td>
                      <td><span className="mono reading-parsed">{reading.valueParsed ?? reading.valueRaw}</span></td>
                      <td><span className="mono">{reading.valueRaw}</span></td>
                      <td className="small muted">{formatDate(reading.capturedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {reopenDialogOpen && history && (
        <Modal
          title="Reabrir lote finalizado"
          width={520}
          onClose={() => { if (!reopening) setReopenDialogOpen(false); }}
          footer={
            <>
              <button type="button" className="secondary" disabled={reopening}
                onClick={() => setReopenDialogOpen(false)}>Cancelar</button>
              <button type="button"
                disabled={reopening || (reopenJustification.trim().length > 0 && reopenJustification.trim().length < 10) || reopenJustification.trim().length > 1000}
                onClick={() => void handleReopen()}>
                {reopening ? "Reabrindo..." : "Confirmar reabertura"}
              </button>
            </>
          }
        >
          <p style={{ marginBottom: 16 }}>
            Reabrir o lote <strong>#{history.batch.code}</strong> permite iniciar um novo ciclo de análises.
            As leituras e o histórico anterior serão preservados.
          </p>
          <div className="field">
            <label htmlFor="reopen-batch-reason">Justificativa (opcional)</label>
            <textarea
              id="reopen-batch-reason"
              rows={4}
              maxLength={1000}
              autoFocus
              value={reopenJustification}
              onChange={(event) => { setReopenJustification(event.target.value); setError(null); }}
              placeholder="Informe o motivo da reabertura (mínimo 10 caracteres)."
              style={{ width: "100%", resize: "vertical" }}
            />
            <small className="muted">{reopenJustification.trim().length}/1000 caracteres (opcional; se preenchida, mínimo 10)</small>
          </div>
          {error && <div className="error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </Modal>
      )}
    </>
  );
}

function auditLabel(action: string): string | null {
  switch (action) {
    case "BATCH_OPENED": return "Lote aberto";
    case "BATCH_COMPLETED": return "Lote concluído";
    case "BATCH_COMPLETION_REVOKED": return "Conclusão removida";
    case "BATCH_FINALIZED":
    case "BATCH_CLOSED":
    case "MASTER_BATCH_CLOSED": return "Lote finalizado";
    case "BATCH_REOPENED": return "Lote reaberto";
    default: return null;
  }
}

function SectorChip({ sectorCode }: { sectorCode?: CaptureSessionRecord["sectorCode"] }) {
  const laboratory = sectorCode === "LABORATORY";
  return <span className={`chip ${laboratory ? "chip-laboratory" : "chip-green"}`}>
    {laboratory ? "LABORATÓRIO" : sectorCode === "PRODUCTION" ? "PRODUÇÃO" : "LOCAL"}
  </span>;
}

function parseHistoryDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const normalized = trimmed.includes("T") || /Z$|[+-]\d\d:\d\d$/.test(trimmed)
    ? trimmed
    : `${trimmed.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(iso: string): string {
  const date = parseHistoryDate(iso);
  return date ? date.toLocaleString("pt-BR") : "—";
}
