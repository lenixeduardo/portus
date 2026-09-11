import type { User } from "../../shared/types";
import { centralQuery } from "./central-connection";

/**
 * Mantém a identidade operacional local espelhada na base central. O login
 * continua local; este registro é usado para permissões e auditoria central.
 */
export async function ensureCentralUserAccess(user: User): Promise<void> {
  const role = user.role === "master"
    ? "master"
    : user.role === "admin"
      ? "admin"
      : user.sectorCode === "LABORATORY" ? "laboratory" : "operator";
  const userResult = await centralQuery<{ id: number }>(
    `INSERT INTO users (username, password_hash, display_name, role, active)
     VALUES ($1, 'managed-by-portus', $1, $2, TRUE)
     ON CONFLICT (username) DO UPDATE
       SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, active = TRUE
     RETURNING id`,
    [user.username, role]
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("Não foi possível sincronizar o usuário com a base central.");

  const isAdmin = user.role === "admin" || user.role === "master";
  const production = user.sectorCode !== "LABORATORY";
  const laboratoryCapture = user.sectorCode === "LABORATORY" && user.laboratoryProfile === "capture";
  const laboratoryClose = user.sectorCode === "LABORATORY" && user.laboratoryProfile === "closure";

  await centralQuery(
    `INSERT INTO user_sector_permissions (
       user_id, sector_id, can_read, can_open, can_capture, can_move,
       can_confirm_production, can_confirm_laboratory
     )
     SELECT $1, s.id,
       CASE WHEN $2 OR ($3 AND s.code = 'PRODUCTION') OR (NOT $3 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END,
       CASE WHEN $2 OR ($3 AND s.code = 'PRODUCTION') THEN TRUE ELSE FALSE END,
       CASE WHEN $2 OR ($3 AND s.code = 'PRODUCTION') OR ($4 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END,
       CASE WHEN $2 OR ($3 AND s.code = 'PRODUCTION') THEN TRUE ELSE FALSE END,
       CASE WHEN $2 OR ($3 AND s.code = 'PRODUCTION') THEN TRUE ELSE FALSE END,
       CASE WHEN $2 OR ($5 AND s.code = 'LABORATORY') THEN TRUE ELSE FALSE END
     FROM sectors s
     WHERE s.code IN ('PRODUCTION', 'LABORATORY')
     ON CONFLICT (user_id, sector_id) DO UPDATE SET
       can_read = EXCLUDED.can_read,
       can_open = EXCLUDED.can_open,
       can_capture = EXCLUDED.can_capture,
       can_move = EXCLUDED.can_move,
       can_confirm_production = EXCLUDED.can_confirm_production,
       can_confirm_laboratory = EXCLUDED.can_confirm_laboratory`,
    [userId, isAdmin, production, laboratoryCapture, laboratoryClose]
  );

  await centralQuery(
    `INSERT INTO application_sector_permissions (
       application_id, sector_id, can_read, can_open, can_capture, can_move,
       can_confirm_production, can_confirm_laboratory
     )
     SELECT a.id, s.id,
       TRUE,
       a.code = 'PORTUS' AND s.code = 'PRODUCTION',
       (a.code = 'PORTUS' AND s.code = 'PRODUCTION') OR (a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY'),
       a.code = 'PORTUS' AND s.code = 'PRODUCTION',
       a.code = 'PORTUS' AND s.code = 'PRODUCTION',
       a.code = 'PORTUS_LABORATORY' AND s.code = 'LABORATORY'
     FROM applications a CROSS JOIN sectors s
     WHERE a.code IN ('PORTUS', 'PORTUS_LABORATORY')
       AND s.code IN ('PRODUCTION', 'LABORATORY')
     ON CONFLICT (application_id, sector_id) DO UPDATE SET
       can_read = EXCLUDED.can_read,
       can_open = EXCLUDED.can_open,
       can_capture = EXCLUDED.can_capture,
       can_move = EXCLUDED.can_move,
       can_confirm_production = EXCLUDED.can_confirm_production,
       can_confirm_laboratory = EXCLUDED.can_confirm_laboratory`
  );
}
