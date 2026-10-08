import type { User } from "../../shared/types";
import { centralQuery, withCentralTransaction } from "./central-connection";

export interface LegacyUserCredentials {
  passwordHash?: string;
  barcodeValue?: string | null;
}

interface CentralUserRow {
  id: number | string;
  username: string;
  display_name: string | null;
  role: string;
  sector_code: "PRODUCTION" | "LABORATORY";
  laboratory_profile: "capture" | null;
  created_at: Date | string;
}

export async function listCentralUsers(): Promise<User[]> {
  const result = await centralQuery<CentralUserRow>(
    "SELECT id, username, display_name, role, sector_code, laboratory_profile, created_at " +
    "FROM users WHERE active ORDER BY lower(COALESCE(display_name, username)), username"
  );
  return result.rows.map(row => ({
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name ?? undefined,
    role: row.role === "laboratory" ? "operator" : row.role as User["role"],
    sectorCode: row.sector_code,
    laboratoryProfile: row.laboratory_profile ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  }));
}

/**
 * A identidade local antiga é importada para o PostgreSQL durante a transição.
 * Nunca substitui um hash de senha real por um placeholder, nem sobrescreve
 * credenciais de outra estação que já estejam consolidadas.
 */
export async function ensureCentralUserAccess(
  user: User,
  legacy?: LegacyUserCredentials
): Promise<void> {
  const role = user.role === "master"
    ? "master"
    : user.role === "supervisor"
      ? "supervisor"
      : user.role === "admin"
        ? "admin"
        : user.sectorCode === "LABORATORY" ? "laboratory" : "operator";
  const displayName = user.displayName ?? user.username;
  await withCentralTransaction(async (client) => {
  const userResult = await client.query<{ id: number }>(
    "INSERT INTO users (username, password_hash, display_name, role, active, sector_code, laboratory_profile, barcode_value) " +
    "VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7) " +
    "ON CONFLICT (username) DO UPDATE SET " +
    "display_name = COALESCE(users.display_name, EXCLUDED.display_name), active = users.active, " +
    "barcode_value = COALESCE(users.barcode_value, EXCLUDED.barcode_value), " +
    "password_hash = CASE WHEN users.password_hash = 'managed-by-portus' " +
    "THEN EXCLUDED.password_hash ELSE users.password_hash END " +
    "WHERE users.role = EXCLUDED.role AND users.sector_code = EXCLUDED.sector_code " +
    "AND (users.barcode_value IS NULL OR EXCLUDED.barcode_value IS NULL " +
    "OR lower(users.barcode_value) = lower(EXCLUDED.barcode_value)) " +
    "RETURNING id",
    [
      user.username,
      legacy?.passwordHash ?? "managed-by-portus",
      displayName,
      role,
      user.sectorCode ?? "PRODUCTION",
      user.laboratoryProfile ?? null,
      legacy?.barcodeValue ?? null
    ]
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("Conflito de identidade: perfil, setor ou etiqueta diferem do cadastro PostgreSQL existente.");

  const isMaster = user.role === "master";
  const isAdmin = user.role === "admin";
  const isSupervisor = user.role === "supervisor";
  const production = user.sectorCode !== "LABORATORY";
  const laboratoryCapture = user.sectorCode === "LABORATORY" && user.laboratoryProfile === "capture";

  await client.query(
    "INSERT INTO user_sector_permissions (user_id, sector_id, can_read, can_open, can_capture, can_move, " +
    "can_confirm_production, can_confirm_laboratory) " +
    "SELECT $1, s.id, " +
    "CASE WHEN $2 OR $3 OR $4 OR ($5 AND s.code = 'PRODUCTION') OR (NOT $5 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END, " +
    "CASE WHEN $2 OR $3 OR ($5 AND s.code = 'PRODUCTION') OR ($6 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END, " +
    "CASE WHEN $2 OR $3 OR ($5 AND s.code = 'PRODUCTION') OR ($6 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END, " +
    "CASE WHEN $2 OR $3 OR ($5 AND s.code = 'PRODUCTION') THEN TRUE ELSE FALSE END, " +
    "FALSE, FALSE FROM sectors s WHERE s.code IN ('PRODUCTION', 'LABORATORY') " +
    "ON CONFLICT (user_id, sector_id) DO UPDATE SET " +
    "can_read = EXCLUDED.can_read, can_open = EXCLUDED.can_open, " +
    "can_capture = EXCLUDED.can_capture, can_move = EXCLUDED.can_move, " +
    "can_confirm_production = EXCLUDED.can_confirm_production, " +
    "can_confirm_laboratory = EXCLUDED.can_confirm_laboratory",
    [userId, isMaster, isAdmin, isSupervisor, production, laboratoryCapture]
  );

  await client.query(
    "INSERT INTO application_sector_permissions (application_id, sector_id, can_read, can_open, can_capture, can_move, " +
    "can_confirm_production, can_confirm_laboratory) " +
    "SELECT a.id, s.id, TRUE, " +
    "(a.code = 'PORTUS' AND s.code = 'PRODUCTION') OR (a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY'), " +
    "(a.code = 'PORTUS' AND s.code = 'PRODUCTION') OR (a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY'), " +
    "a.code = 'PORTUS' AND s.code = 'PRODUCTION', FALSE, FALSE " +
    "FROM applications a CROSS JOIN sectors s " +
    "WHERE a.code IN ('PORTUS', 'PORTUS_LABORATORY') AND s.code IN ('PRODUCTION', 'LABORATORY') " +
    "ON CONFLICT (application_id, sector_id) DO UPDATE SET " +
    "can_read = EXCLUDED.can_read, can_open = EXCLUDED.can_open, " +
    "can_capture = EXCLUDED.can_capture, can_move = EXCLUDED.can_move, " +
    "can_confirm_production = EXCLUDED.can_confirm_production, " +
    "can_confirm_laboratory = EXCLUDED.can_confirm_laboratory"
  );
  });
}

export async function updateCentralUserPassword(username: string, passwordHash: string): Promise<void> {
  const result = await centralQuery(
    "UPDATE users SET password_hash = $1 WHERE username = $2 AND active RETURNING id",
    [passwordHash, username]
  );
  if (!result.rowCount) throw new Error("Usuário não encontrado no PostgreSQL central.");
}

export async function deactivateCentralUser(username: string): Promise<void> {
  const result = await centralQuery(
    "UPDATE users SET active = FALSE WHERE username = $1 AND active RETURNING id",
    [username]
  );
  if (!result.rowCount) throw new Error("Usuário não encontrado no PostgreSQL central.");
}
