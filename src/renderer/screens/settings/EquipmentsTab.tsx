import React, { useEffect, useState } from "react";
import type { Equipment, LineDelimiter } from "../../../shared/types";
import type { EquipmentUpdateInput, SerialPortInfo } from "../../../shared/ipc";
import { Modal } from "../../components/Modal";

const BAUD_OPTIONS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const DELIMITER_OPTIONS: { value: LineDelimiter; label: string }[] = [
  { value: "lf", label: "LF (\\n) — tolerante, cobre LF e CRLF" },
  { value: "crlf", label: "CRLF (\\r\\n) — estrito" },
  { value: "cr", label: "CR (\\r) — equipamentos antigos" }
];

export function EquipmentsTab() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const [eq, pp] = await Promise.all([
      window.api.equipments.list(),
      window.api.serial.listPorts()
    ]);
    setEquipments(eq);
    setPorts(pp);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  if (loading) return <div className="muted">Carregando...</div>;

  return (
    <>
      {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Nome</th>
              <th>Porta</th>
              <th>Baud</th>
              <th>Config</th>
              <th>Regex</th>
              <th>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {equipments.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.slotIndex}</strong></td>
                <td>{e.name}</td>
                <td className="mono">{e.portPath || <span className="muted">—</span>}</td>
                <td>{e.baudRate}</td>
                <td className="muted">
                  {e.dataBits}-{e.stopBits}-{e.parity[0].toUpperCase()}
                </td>
                <td className="mono small">
                  {e.parseRegex ? truncate(e.parseRegex, 24) : <span className="muted">—</span>}
                </td>
                <td>
                  <span className={`chip ${e.enabled ? "chip-green" : "chip-gray"}`}>
                    {e.enabled ? "ATIVO" : "DESATIVADO"}
                  </span>
                </td>
                <td>
                  <button className="link" onClick={() => setEditing(e)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12 }} className="muted">
        {ports.length === 0
          ? "Nenhuma porta serial detectada nesta máquina."
          : `Portas detectadas: ${ports.map((p) => p.path).join(", ")}`}
      </div>

      {editing && (
        <EquipmentEditModal
          equipment={editing}
          ports={ports}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setError(null);
            reload();
          }}
          onError={setError}
        />
      )}
    </>
  );
}

interface EditProps {
  equipment: Equipment;
  ports: SerialPortInfo[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function EquipmentEditModal({ equipment, ports, onClose, onSaved, onError }: EditProps) {
  const [name, setName] = useState(equipment.name);
  const [portPath, setPortPath] = useState(equipment.portPath);
  const [baudRate, setBaudRate] = useState(equipment.baudRate);
  const [dataBits, setDataBits] = useState(equipment.dataBits);
  const [stopBits, setStopBits] = useState(equipment.stopBits);
  const [parity, setParity] = useState(equipment.parity);
  const [enabled, setEnabled] = useState(equipment.enabled);
  const [parseRegex, setParseRegex] = useState(equipment.parseRegex ?? "");
  const [lineDelimiter, setLineDelimiter] = useState<LineDelimiter>(equipment.lineDelimiter ?? "lf");
  const [skipFirstReading, setSkipFirstReading] = useState(equipment.skipFirstReading ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const knownPorts = new Set(ports.map((p) => p.path));
  const showCustomPortNote = portPath && !knownPorts.has(portPath);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const patch: EquipmentUpdateInput = {
      name,
      portPath,
      baudRate,
      dataBits,
      stopBits,
      parity,
      enabled,
      parseRegex: parseRegex || undefined,
      lineDelimiter,
      skipFirstReading
    };
    const res = await window.api.equipments.update(equipment.id, patch);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
    onError(""); // limpa erro pai (se houver)
  }

  return (
    <Modal
      title={`Slot ${equipment.slotIndex} — Equipamento`}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Porta serial</label>
            <select value={portPath} onChange={(e) => setPortPath(e.target.value)}>
              <option value="">(nenhuma)</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path}
                  {p.manufacturer ? ` — ${p.manufacturer}` : ""}
                </option>
              ))}
              {portPath && !knownPorts.has(portPath) && (
                <option value={portPath}>{portPath} (configurada)</option>
              )}
            </select>
            {showCustomPortNote && (
              <small className="muted">Porta não detectada agora — será tentada na captura.</small>
            )}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Baud rate</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
            >
              {BAUD_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Paridade</label>
            <select
              value={parity}
              onChange={(e) => setParity(e.target.value as Equipment["parity"])}
            >
              <option value="none">Nenhuma</option>
              <option value="even">Par</option>
              <option value="odd">Ímpar</option>
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Data bits</label>
            <select
              value={dataBits}
              onChange={(e) => setDataBits(Number(e.target.value) as Equipment["dataBits"])}
            >
              {[5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Stop bits</label>
            <select
              value={stopBits}
              onChange={(e) => setStopBits(Number(e.target.value) as Equipment["stopBits"])}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Terminador de linha</label>
          <select
            value={lineDelimiter}
            onChange={(e) => setLineDelimiter(e.target.value as LineDelimiter)}
          >
            {DELIMITER_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <small className="muted">
            Caractere que o equipamento envia ao fim de cada leitura. Na dúvida, use LF.
          </small>
        </div>

        <div className="field">
          <label>Regex de parsing (opcional)</label>
          <input
            className="mono"
            value={parseRegex}
            onChange={(e) => setParseRegex(e.target.value)}
            placeholder="ex.: (?<value>[-+]?\\d+(?:[.,]\\d+)?)"
          />
          <small className="muted">
            Grupo nomeado <code>(?&lt;value&gt;…)</code> ou o primeiro grupo define o valor.
            Para o espectrofotômetro (vários campos na linha), ancore no campo certo —
            ex.: <code>ABS[:\s]*(?&lt;value&gt;\d+[.,]\d+)</code>. Vírgula decimal é normalizada para ponto.
          </small>
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={skipFirstReading}
              onChange={(e) => setSkipFirstReading(e.target.checked)}
            />
            <span>Ignorar primeira leitura da sessão</span>
          </label>
          <small className="muted">
            Use quando o equipamento envia uma linha incompleta (cortada) antes do valor real.
            A segunda linha em diante é processada normalmente.
          </small>
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Habilitado para captura</span>
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </Modal>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
