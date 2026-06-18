import { all, get, run } from "./query";
import type {
  Equipment,
  EquipmentProtocol,
  LineDelimiter,
  ModbusFunction,
  ModbusRegisterDecode
} from "../../shared/types";

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
  skip_first_reading: number;
  stop_after_first_reading: number;
  protocol: string;
  modbus_unit_id: number;
  modbus_function: number;
  modbus_start_address: number;
  modbus_quantity: number;
  modbus_register_decode: string;
  modbus_poll_interval_ms: number;
  modbus_response_timeout_ms: number;
  scale_enabled: number;
  scale_raw_min: number | null;
  scale_raw_max: number | null;
  scale_out_min: number | null;
  scale_out_max: number | null;
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
    lineDelimiter: (row.line_delimiter ?? "lf") as LineDelimiter,
    skipFirstReading: row.skip_first_reading === 1,
    stopAfterFirstReading: row.stop_after_first_reading === 1,
    protocol: (row.protocol ?? "passive") as EquipmentProtocol,
    modbusUnitId: row.modbus_unit_id,
    modbusFunction: row.modbus_function as ModbusFunction,
    modbusStartAddress: row.modbus_start_address,
    modbusQuantity: row.modbus_quantity,
    modbusRegisterDecode: (row.modbus_register_decode ?? "uint16") as ModbusRegisterDecode,
    modbusPollIntervalMs: row.modbus_poll_interval_ms,
    modbusResponseTimeoutMs: row.modbus_response_timeout_ms,
    scaleEnabled: row.scale_enabled === 1,
    scaleRawMin: row.scale_raw_min ?? undefined,
    scaleRawMax: row.scale_raw_max ?? undefined,
    scaleOutMin: row.scale_out_min ?? undefined,
    scaleOutMax: row.scale_out_max ?? undefined
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
      stop_bits = ?, parity = ?, enabled = ?, parse_regex = ?, line_delimiter = ?,
      skip_first_reading = ?, stop_after_first_reading = ?, protocol = ?,
      modbus_unit_id = ?, modbus_function = ?,
      modbus_start_address = ?, modbus_quantity = ?, modbus_register_decode = ?,
      modbus_poll_interval_ms = ?, modbus_response_timeout_ms = ?, scale_enabled = ?,
      scale_raw_min = ?, scale_raw_max = ?, scale_out_min = ?, scale_out_max = ?
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
    merged.skipFirstReading ? 1 : 0,
    merged.stopAfterFirstReading ? 1 : 0,
    merged.protocol,
    merged.modbusUnitId,
    merged.modbusFunction,
    merged.modbusStartAddress,
    merged.modbusQuantity,
    merged.modbusRegisterDecode,
    merged.modbusPollIntervalMs,
    merged.modbusResponseTimeoutMs,
    merged.scaleEnabled ? 1 : 0,
    merged.scaleRawMin ?? null,
    merged.scaleRawMax ?? null,
    merged.scaleOutMin ?? null,
    merged.scaleOutMax ?? null,
    id
  );
  return getEquipment(id);
}
