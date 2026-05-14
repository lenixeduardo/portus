import { getDb } from "./connection";
import type { Equipment } from "../../shared/types";

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
    parseRegex: row.parse_regex ?? undefined
  };
}

export function listEquipments(): Equipment[] {
  const rows = getDb()
    .prepare("SELECT * FROM equipments ORDER BY slot_index")
    .all() as EquipmentRow[];
  return rows.map(rowToEquipment);
}

export function getEquipment(id: number): Equipment | null {
  const row = getDb()
    .prepare("SELECT * FROM equipments WHERE id = ?")
    .get(id) as EquipmentRow | undefined;
  return row ? rowToEquipment(row) : null;
}

export function updateEquipment(id: number, patch: Partial<Equipment>): Equipment | null {
  const current = getEquipment(id);
  if (!current) return null;
  const merged: Equipment = { ...current, ...patch, id, slotIndex: current.slotIndex };
  getDb()
    .prepare(
      `UPDATE equipments SET
        name = ?, port_path = ?, baud_rate = ?, data_bits = ?,
        stop_bits = ?, parity = ?, enabled = ?, parse_regex = ?
       WHERE id = ?`
    )
    .run(
      merged.name,
      merged.portPath,
      merged.baudRate,
      merged.dataBits,
      merged.stopBits,
      merged.parity,
      merged.enabled ? 1 : 0,
      merged.parseRegex ?? null,
      id
    );
  return getEquipment(id);
}
