import { all, get, run } from "./query";
import type { Equipment, LineDelimiter } from "../../shared/types";

interface EquipmentRow {
  id: number;
  name: string;
  port_path: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
  enabled: number;
  slot_index: number;
  parse_regex: string | null;
  line_delimiter: string | null;
}

function rowToEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    portPath: row.port_path,
    baudRate: row.baud_rate,
    dataBits: row.data_bits as Equipment["dataBits"],
    stopBits: row.stop_bits as Equipment["stopBits"],
    parity: row.parity as Equipment["parity"],
    enabled: row.enabled === 1,
    slotIndex: row.slot_index,
    parseRegex: row.parse_regex ?? undefined,
    lineDelimiter: (row.line_delimiter ?? "lf") as LineDelimiter
  };
}

export function listEquipments(): Equipment[] {
  return all<EquipmentRow>("SELECT * FROM equipments ORDER BY slot_index").map(rowToEquipment);
}

export function getEquipment(id: number): Equipment | null {
  const row = get<EquipmentRow>("SELECT * FROM equipments WHERE id = ?", id);
  return row ? rowToEquipment(row) : null;
}

export function updateEquipment(id: number, patch: Partial<Equipment>): Equipment | null {
  const current = getEquipment(id);
  if (!current) return null;
  const merged: Equipment = { ...current, ...patch, id, slotIndex: current.slotIndex };
  run(
    `UPDATE equipments SET
      name = ?, port_path = ?, baud_rate = ?, data_bits = ?,
      stop_bits = ?, parity = ?, enabled = ?, parse_regex = ?, line_delimiter = ?
     WHERE id = ?`,
    merged.name,
    merged.portPath,
    merged.baudRate,
    merged.dataBits,
    merged.stopBits,
    merged.parity,
    merged.enabled ? 1 : 0,
    merged.parseRegex ?? null,
    merged.lineDelimiter,
    id
  );
  return getEquipment(id);
}
