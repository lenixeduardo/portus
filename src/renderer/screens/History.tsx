import React, { useEffect, useState, useMemo } from "react";
import type { BatchWithProduct, BatchHistory, CaptureSessionRecord } from "../../shared/ipc";

export function History() {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [history, setHistory] = useState<BatchHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Estados de filtro
  const [filterEquipment, setFilterEquipment] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  useEffect(() => {
    window.api.batches.listAll().then(setBatches);
  }, []);

  useEffect(() => {
    // Resetar filtros ao mudar de lote
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
    window.api.history.getBatch(Number(selectedId)).then((res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistory(res.data);
    });
  }, [selectedId]);

  // Lista de equipamentos únicos contidos no histórico deste lote
  const uniqueEquipments = useMemo(() => {
    if (!history) return [];
    const eqMap = new Map<number, string>();
    for (const session of history.sessions) {
      for (const r of session.readings) {
        eqMap.set(r.equipmentId, r.equipmentName);
      }
    }
    return Array.from(eqMap.entries());
  }, [history]);

  // Sessões e leituras filtradas
  const filteredSessions = useMemo(() => {
    if (!history) return [];

    const hasFilters = !!(filterEquipment || filterStartDate || filterEndDate);

    return history.sessions
      .map((session) => {
        const filteredReadings = session.readings.filter((r) => {
          if (filterEquipment && r.equipmentId !== Number(filterEquipment)) {
            return false;
          }

          const rDate = new Date(r.capturedAt.replace(" ", "T") + "Z");

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

        return {
          ...session,
          readings: filteredReadings
        };
      })
      .filter((session) => {
        if (hasFilters) {
          // Oculta sessões sem leituras quando houver filtros aplicados
          return session.readings.length > 0;
        }
        return true;
      });
  }, [history, filterEquipment, filterStartDate, filterEndDate]);

  const totalReadings = filteredSessions.reduce((acc, s) => acc + s.readings.length, 0);

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
      setExportMsg("Arquivo CSV exportado com sucesso.");
      setTimeout(() => setExportMsg(null), 4000);
    }
  }

  const isAnyFilterActive = !!(filterEquipment || filterStartDate || filterEndDate);

  return (
    <>
      <div className="history-toolbar">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Selecione um lote...</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.code} — {b.productName}{" "}
                {b.status === "closed" ? "(encerrado)" : "(aberto)"}
              </option>
            ))}
          </select>
        </div>

        {history && (
          <button onClick={handleExport} disabled={exporting} className="export-btn">
            {exporting ? "Exportando..." : "⬇ Exportar CSV"}
          </button>
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
            <div className="history-summary-item">
              <span>Produto</span>
              <strong>{history.batch.productName}</strong>
            </div>
            <div className="history-summary-item">
              <span>Código</span>
              <strong>#{history.batch.code}</strong>
            </div>
            <div className="history-summary-item">
              <span>Operador</span>
              <strong>{history.batch.operatorName}</strong>
            </div>
            <div className="history-summary-item">
              <span>Abertura</span>
              <strong>{formatDate(history.batch.openedAt)}</strong>
            </div>
            <div className="history-summary-item">
              <span>Status</span>
              <strong>
                <span className={`chip ${history.batch.status === "open" ? "chip-green" : "chip-gray"}`}>
                  {history.batch.status === "open" ? "ABERTO" : "ENCERRADO"}
                </span>
              </strong>
            </div>
            <div className="history-summary-item">
              <span>Total leituras</span>
              <strong>{totalReadings}</strong>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="history-filters">
            <div className="field">
              <label>Equipamento</label>
              <select
                value={filterEquipment}
                onChange={(e) => setFilterEquipment(e.target.value)}
              >
                <option value="">Todos os equipamentos</option>
                {uniqueEquipments.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Data Inicial</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Data Final</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
            {isAnyFilterActive && (
              <div className="history-filters-actions">
                <button
                  className="secondary"
                  style={{ height: 38, padding: "0 16px" }}
                  onClick={() => {
                    setFilterEquipment("");
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }}
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {history.sessions.length === 0 ? (
            <div className="placeholder" style={{ marginTop: 16 }}>
              Nenhuma sessão de captura registrada neste lote.
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="placeholder" style={{ marginTop: 16 }}>
              Nenhum registro corresponde aos filtros aplicados.
            </div>
          ) : (
            <div className="history-timeline">
              {filteredSessions.map((session) => {
                const originalIdx = history.sessions.findIndex((s) => s.id === session.id);
                return (
                  <SessionCard
                    key={session.id}
                    session={session}
                    index={originalIdx !== -1 ? originalIdx + 1 : 1}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function SessionCard({ session, index }: { session: CaptureSessionRecord; index: number }) {
  const [open, setOpen] = useState(true);
  const duration = calcDuration(session.startedAt, session.endedAt);
  const statusLabel = sessionStatusLabel(session.status);
  const statusClass = sessionStatusClass(session.status);

  return (
    <div className="session-card">
      <button className="session-header" onClick={() => setOpen((o) => !o)}>
        <div className="session-header-left">
          <span className="session-index">Sessão {index}</span>
          <span className={`chip ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="session-header-right">
          <span className="session-meta-item">
            <span>Início:</span> {formatDate(session.startedAt)}
          </span>
          {session.endedAt && (
            <span className="session-meta-item">
              <span>Fim:</span> {formatDate(session.endedAt)}
            </span>
          )}
          <span className="session-meta-item">
            <span>Duração:</span> {duration}
          </span>
          <span className="session-meta-item">
            <span>Leituras:</span> {session.readings.length}
          </span>
          <span className="session-toggle">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="session-body">
          {session.readings.length === 0 ? (
            <div className="muted small" style={{ padding: "12px 16px" }}>
              Nenhuma leitura capturada nesta sessão.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Slot</th>
                  <th>Valor Bruto</th>
                  <th>Valor Parseado</th>
                  <th>Capturado em</th>
                </tr>
              </thead>
              <tbody>
                {session.readings.map((r) => (
                  <tr key={r.id}>
                    <td>{r.equipmentName}</td>
                    <td>{r.slotIndex + 1}</td>
                    <td><span className="mono">{r.valueRaw}</span></td>
                    <td>
                      {r.valueParsed ? (
                        <span className="mono reading-parsed">{r.valueParsed}</span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td className="small muted">{formatDate(r.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function sessionStatusLabel(status: string): string {
  switch (status) {
    case "completed": return "CONCLUÍDA";
    case "cancelled": return "CANCELADA";
    case "active":    return "ATIVA";
    default:          return status.toUpperCase();
  }
}

function sessionStatusClass(status: string): string {
  switch (status) {
    case "completed": return "chip-green";
    case "cancelled": return "chip-gray";
    case "active":    return "chip-blue";
    default:          return "chip-gray";
  }
}

function calcDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return "—";
  const start = new Date(startedAt.replace(" ", "T") + "Z").getTime();
  const end = new Date(endedAt.replace(" ", "T") + "Z").getTime();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}min ${rem}s` : `${mins}min`;
}

function formatDate(iso: string): string {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString("pt-BR");
}
