import type { Equipment } from "../../shared/types";
import { centralQuery } from "./central-connection";
import { getRuntimeStationCode } from "./central-station-settings-repo";

interface EquipmentProfileRow {
  id: number | string;
  name: string;
  code: string | null;
  config: Record<string, unknown> | string | null;
}

const ORDER = ["ESPECTROFOTOMETRO", "BALANCA", "VISCOSIMETRO", "PH_METRO", "REFRATOMETRO", "RESERVA"];
const NUMBER_REGEX = "(?<value>[-+]?\\d+(?:[.,]\\d+)?)";

function toEquipment(row: EquipmentProfileRow): Equipment {
  const idx = ORDER.indexOf(row.code || "");
  const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config ?? {};
  return {
    name: row.name,
    portPath: "",
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    enabled: idx < 5,
    parseRegex: NUMBER_REGEX,
    lineDelimiter: "lf",
    skipFirstReading: false,
    stopAfterFirstReading: idx === 1,
    protocol: "passive",
    modbusUnitId: 1,
    modbusFunction: 3,
    modbusStartAddress: 0,
    modbusQuantity: 2,
    modbusRegisterDecode: "uint16",
    modbusPollIntervalMs: 1000,
    modbusResponseTimeoutMs: 1000,
    scaleEnabled: false,
    ...config,
    id: Number(row.id),
    slotIndex: typeof config.slotIndex === "number" ? config.slotIndex : idx + 1
  } as Equipment;
}

export async function listCentralEquipments(): Promise<Equipment[]> {
  const result = await centralQuery<EquipmentProfileRow>(
    "SELECT e.id,e.name,e.code,p.config FROM equipments e " +
    "LEFT JOIN portus_station_equipment_profiles p " +
    "ON p.station_code=$1 AND p.equipment_id=e.id " +
    "WHERE e.code = ANY($2::text[]) ORDER BY e.id",
    [getRuntimeStationCode(), ORDER]
  );
  return result.rows.map(toEquipment).sort((a,b) => a.slotIndex-b.slotIndex);
}

export async function getCentralEquipment(id: number): Promise<Equipment | null> {
  return (await listCentralEquipments()).find(e => e.id === id) ?? null;
}

export async function updateCentralEquipment(id: number, patch: Partial<Equipment>): Promise<Equipment | null> {
  const current = await getCentralEquipment(id);
  if (!current) return null;
  const merged: Equipment = { ...current, ...patch, id, slotIndex: current.slotIndex };
  await centralQuery(
    "INSERT INTO portus_station_equipment_profiles (station_code,slot_index,equipment_id,config) " +
    "VALUES ($1,$2,$3,$4::jsonb) " +
    "ON CONFLICT (station_code,slot_index) DO UPDATE SET " +
    "equipment_id=EXCLUDED.equipment_id,config=EXCLUDED.config,updated_at=now()",
    [getRuntimeStationCode(), merged.slotIndex, id, JSON.stringify(merged)]
  );
  return getCentralEquipment(id);
}
