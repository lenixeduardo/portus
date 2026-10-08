import { hostname } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { centralQuery } from "./central-connection";
import type { StationIdentity } from "./settings-repo";

function stationIdentityFile(): string | null {
  const root = process.env.LOCALAPPDATA || process.env.APPDATA;
  return root ? join(root, "PORTUS", "station-identity.json") : null;
}

function savedStationCode(): string | undefined {
  const filename = stationIdentityFile();
  if (!filename || !existsSync(filename)) return undefined;
  const parsed = JSON.parse(readFileSync(filename, "utf8")) as { code?: string };
  return parsed.code;
}

/**
 * A identificação física da estação é o único bootstrap local. Todos os
 * dados de negócio e parâmetros operacionais permanecem no PostgreSQL.
 */
export function saveStationIdentityFromLegacy(raw: string): void {
  const filename = stationIdentityFile();
  if (!filename || existsSync(filename) || process.env.PORTUS_STATION_CODE) return;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "-").slice(0, 64);
  if (!code) return;
  mkdirSync(join(process.env.LOCALAPPDATA || process.env.APPDATA!, "PORTUS"), { recursive: true });
  writeFileSync(filename, JSON.stringify({ code }, null, 2), { flag: "wx" });
}

export function getRuntimeStationCode(): string {
  const raw = process.env.PORTUS_STATION_CODE?.trim() || savedStationCode() || hostname().trim();
  const code = raw.toUpperCase().replace(/[^A-Z0-9._-]/g, "-").slice(0, 64);
  if (!code) throw new Error("Identificação física da estação indisponível.");
  return code;
}

export async function listCentralStationSettings(): Promise<Record<string, string>> {
  const result = await centralQuery<{ key: string; value: string }>(
    "SELECT key, value FROM portus_station_settings WHERE station_code = $1 ORDER BY key",
    [getRuntimeStationCode()]
  );
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

export async function getCentralStationSetting(key: string): Promise<string | null> {
  const result = await centralQuery<{ value: string }>(
    "SELECT value FROM portus_station_settings WHERE station_code=$1 AND key=$2",
    [getRuntimeStationCode(), key]
  );
  return result.rows[0]?.value ?? null;
}

export async function setCentralStationSetting(key: string, value: string): Promise<void> {
  await centralQuery(
    "INSERT INTO portus_station_settings (station_code,key,value) VALUES ($1,$2,$3) " +
    "ON CONFLICT (station_code,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
    [getRuntimeStationCode(), key, value]
  );
}

export async function getCentralCaptureTimeoutSeconds(): Promise<number> {
  const raw = await getCentralStationSetting("capture_timeout_seconds");
  const value = Number(raw || 30);
  return Number.isInteger(value) && value > 0 && value <= 3600 ? value : 30;
}

export async function getCentralStationIdentity(): Promise<StationIdentity> {
  const settings = await listCentralStationSettings();
  const sector = settings.station_sector_code?.trim().toUpperCase();
  if (sector !== "PRODUCTION" && sector !== "LABORATORY") {
    throw new Error("Defina o setor desta máquina em Configurações antes da captura.");
  }
  const name = settings.station_name?.trim() || getRuntimeStationCode();
  return { code: getRuntimeStationCode(), name, sectorCode: sector };
}
