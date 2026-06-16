import React, { useEffect, useState } from "react";
import type {
  Equipment,
  EquipmentProtocol,
  LineDelimiter,
  ModbusFunction,
  ModbusRegisterDecode
} from "../../../shared/types";
import type { EquipmentUpdateInput, SerialPortInfo } from "../../../shared/ipc";
import { Modal } from "../../components/Modal";

const BAUD_OPTIONS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const DELIMITER_OPTIONS: { value: LineDelimiter; label: string }[] = [
  { value: "lf", label: "LF (\\n) — tolerante, cobre LF e CRLF" },
  { value: "crlf", label: "CRLF (\\r\\n) — estrito" },
  { value: "cr", label: "CR (\\r) — equipamentos antigos" }
];

const DECODE_OPTIONS: { value: ModbusRegisterDecode; label: string }[] = [
  { value: "uint16", label: "uint16 — 1º registrador (0 a 65535)" },
  { value: "int16", label: "int16 — 1º registrador com sinal" },
  { value: "uint32_be", label: "uint32 high-low — 2 registradores" },
  { value: "uint32_le", label: "uint32 low-high — 2 registradores (word swap)" }
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
              <th>Protocolo</th>
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
                <td>
                  <span className={`chip ${e.protocol === "modbus_rtu" ? "chip-green" : "chip-gray"}`}>
                    {e.protocol === "modbus_rtu" ? "MODBUS" : "PASSIVO"}
                  </span>
                </td>
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
  const [protocol, setProtocol] = useState<EquipmentProtocol>(equipment.protocol ?? "passive");
  const [modbusUnitId, setModbusUnitId] = useState(equipment.modbusUnitId ?? 1);
  const [modbusFunction, setModbusFunction] = useState<ModbusFunction>(equipment.modbusFunction ?? 3);
  const [modbusStartAddress, setModbusStartAddress] = useState(equipment.modbusStartAddress ?? 0);
  const [modbusQuantity, setModbusQuantity] = useState(equipment.modbusQuantity ?? 2);
  const [modbusRegisterDecode, setModbusRegisterDecode] = useState<ModbusRegisterDecode>(
    equipment.modbusRegisterDecode ?? "uint16"
  );
  const [modbusPollIntervalMs, setModbusPollIntervalMs] = useState(equipment.modbusPollIntervalMs ?? 1000);
  const [modbusResponseTimeoutMs, setModbusResponseTimeoutMs] = useState(
    equipment.modbusResponseTimeoutMs ?? 1000
  );
  const [scaleEnabled, setScaleEnabled] = useState(equipment.scaleEnabled ?? false);
  const [scaleRawMin, setScaleRawMin] = useState(equipment.scaleRawMin ?? 0);
  const [scaleRawMax, setScaleRawMax] = useState(equipment.scaleRawMax ?? 0);
  const [scaleOutMin, setScaleOutMin] = useState(equipment.scaleOutMin ?? 0);
  const [scaleOutMax, setScaleOutMax] = useState(equipment.scaleOutMax ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isModbus = protocol === "modbus_rtu";

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
      skipFirstReading,
      protocol,
      modbusUnitId,
      modbusFunction,
      modbusStartAddress,
      modbusQuantity,
      modbusRegisterDecode,
      modbusPollIntervalMs,
      modbusResponseTimeoutMs,
      scaleEnabled,
      scaleRawMin,
      scaleRawMax,
      scaleOutMin,
      scaleOutMax
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

        <div className="field">
          <label>Protocolo</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as EquipmentProtocol)}
          >
            <option value="passive">Passivo — equipamento envia ao apertar PRINT</option>
            <option value="modbus_rtu">Modbus RTU — o app envia a requisição e lê</option>
          </select>
          <small className="muted">
            No modo Modbus RTU o Portus atua como mestre: envia a requisição de leitura
            (ex.: <code>10 03 00 00 00 02 …</code>) e lê a resposta do nó. O CRC é calculado
            automaticamente.
          </small>
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

        {!isModbus && (
        <>
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
        </>
        )}

        {isModbus && (
          <>
            <div className="grid-2">
              <div className="field">
                <label>Endereço do nó (unit id)</label>
                <input
                  type="number"
                  min={1}
                  max={247}
                  value={modbusUnitId}
                  onChange={(e) => setModbusUnitId(Number(e.target.value))}
                />
                <small className="muted">Decimal. Ex.: nó <code>0x10</code> = 16.</small>
              </div>
              <div className="field">
                <label>Função Modbus</label>
                <select
                  value={modbusFunction}
                  onChange={(e) => setModbusFunction(Number(e.target.value) as ModbusFunction)}
                >
                  <option value={3}>03 — Read Holding Registers</option>
                  <option value={4}>04 — Read Input Registers</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Endereço inicial</label>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={modbusStartAddress}
                  onChange={(e) => setModbusStartAddress(Number(e.target.value))}
                />
                <small className="muted">Offset do registrador (base 0).</small>
              </div>
              <div className="field">
                <label>Quantidade de registradores</label>
                <input
                  type="number"
                  min={1}
                  max={125}
                  value={modbusQuantity}
                  onChange={(e) => setModbusQuantity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="field">
              <label>Decodificação dos registradores</label>
              <select
                value={modbusRegisterDecode}
                onChange={(e) => setModbusRegisterDecode(e.target.value as ModbusRegisterDecode)}
              >
                {DECODE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Intervalo de polling (ms)</label>
                <input
                  type="number"
                  min={100}
                  max={60000}
                  value={modbusPollIntervalMs}
                  onChange={(e) => setModbusPollIntervalMs(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Timeout de resposta (ms)</label>
                <input
                  type="number"
                  min={100}
                  max={60000}
                  value={modbusResponseTimeoutMs}
                  onChange={(e) => setModbusResponseTimeoutMs(Number(e.target.value))}
                />
              </div>
            </div>
          </>
        )}

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={scaleEnabled}
              onChange={(e) => setScaleEnabled(e.target.checked)}
            />
            <span>Aplicar linearização (regra de três)</span>
          </label>
          <small className="muted">
            Converte o valor lido de uma escala para outra:&nbsp;
            <code>saída = (x − entrada_min) × (saída_max − saída_min) / (entrada_max − entrada_min) + saída_min</code>.
            Ex.: entrada 339–9980 → saída 0–14.
          </small>
        </div>

        {scaleEnabled && (
          <div className="grid-2">
            <div className="field">
              <label>Entrada mín.</label>
              <input
                type="number"
                value={scaleRawMin}
                onChange={(e) => setScaleRawMin(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Entrada máx.</label>
              <input
                type="number"
                value={scaleRawMax}
                onChange={(e) => setScaleRawMax(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Saída mín.</label>
              <input
                type="number"
                value={scaleOutMin}
                onChange={(e) => setScaleOutMin(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Saída máx.</label>
              <input
                type="number"
                value={scaleOutMax}
                onChange={(e) => setScaleOutMax(Number(e.target.value))}
              />
            </div>
          </div>
        )}

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
