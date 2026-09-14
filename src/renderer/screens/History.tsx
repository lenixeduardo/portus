import React, { useEffect, useState, useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { BatchWithProduct, BatchHistory, CaptureSessionRecord } from "../../shared/ipc";
import type { User } from "../../shared/types";

export function History({ user }: { user: User }) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [history, setHistory] = useState<BatchHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reopening, setReopening] = useState(false);
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

    if (!selectedId) {
      setHistory(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setHistory(null);
    const historyRequest = centralMode
      ? window.api.central.history.getBatch(Number(selectedId))
      : window.api.history.getBatch(Number(selectedId));
    historyRequest.then((res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistory(res.data);
    });
  }, [selectedId, centralMode]);

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

  async function handleExport() {
    if (!selectedId) return;
    setExporting(true);
    setExportMsg(null);

    const filters = {
      equipmentId: filterEquipment ? Number(filterEquipment) : undefined,
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined
    };

    const res = await window.api.history.exportCsv(Number(selectedId), filters);
    setExporting(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setExportMsg("Arquivo Excel (.xlsx) exportado com sucesso.");
      setTimeout(() => setExportMsg(null), 4000);
    }
  }

  async function handleReopen() {
    if (!selectedId || !history || history.batch.status !== "closed") return;
    if (!confirm(`Reabrir o lote "${history.batch.code}"? As confirmações da Produção e do Laboratório serão reiniciadas.`)) return;

    setReopening(true);
    setError(null);
    const res = await window.api.central.batches.reopen(Number(selectedId));
    setReopening(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    setHistory((current) => current ? { ...current, batch: res.data } : current);
    setBatches((current) => current.map((batch) => batch.id === res.data.id ? res.data : batch));
    setExportMsg("Lote reaberto. Produção e Laboratório devem realizar um novo ciclo de leitura e fechamento.");
    setTimeout(() => setExportMsg(null), 5000);
  }

  const isAnyFilterActive = !!(filterEquipment || filterStartDate || filterEndDate);
  const canReopenBatch = user.role === "admin" || user.role === "master";

  return (
    <>
      <div className="history-toolbar">
        <div className="batch-picker">
          {batches.length === 0 ? (
            <div className="batch-picker-item" style={{ color: "var(--text-faint)", cursor: "default" }}>
              Nenhum lote cadastrado
            </div>
          ) : (
            batches.map((b) => (
              <button
                key={b.id}
                className={`batch-picker-item${selectedId === b.id ? " batch-picker-item--selected" : ""}`}
                onClick={() => setSelectedId(selectedId === b.id ? "" : b.id)}
              >
                <span className="batch-picker-code">#{b.code}</span>
                <span className="batch-picker-name">{b.productName}</span>
                <span className={`chip ${b.status === "closed" ? "chip-gray" : "chip-green"}`}>
                  {b.status === "closed" ? "ENCERRADO" : "ABERTO"}
                </span>
              </button>
            ))
          )}
        </div>

        {history && (
          <div className="history-toolbar-actions">
            {canReopenBatch && centralMode && history.batch.status === "closed" && (
              <button onClick={handleReopen} disabled={reopening} className="secondary history-reopen-btn">
                <RotateCcw size={15} aria-hidden="true" />
                {reopening ? "Reabrindo..." : "Reabrir lote"}
              </button>
            )}
            <button onClick={handleExport} disabled={exporting} className="export-btn">
              {exporting ? "Exportando..." : "⬇ Exportar Excel"}
            </button>
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
                {history.batch.status === "open" ? "ABERTO" : "ENCERRADO"}
              </span></strong>
            </div>
            <div className="history-summary-item"><span>Total leituras</span><strong>{totalReadings}</strong></div>
          </div>

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
                  <th>Setor</th><th>Sessão</th><th>Responsável</th><th>Equipamento</th>
                  <th>Canal</th><th>Valor capturado</th><th>Valor bruto</th><th>Data e hora</th>
                </tr></thead>
                <tbody>
                  {unifiedReadings.map(({ reading, session, sessionNumber }) => (
                    <tr key={reading.id}>
                      <td><SectorChip sectorCode={session.sectorCode} /></td>
                      <td className="mono">#{sessionNumber}</td>
                      <td>{session.operatorName ?? "—"}</td>
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
    </>
  );
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
