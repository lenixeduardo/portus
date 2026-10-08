import { centralQuery } from "./central-connection";
import { getRuntimeStationCode } from "./central-station-settings-repo";

export interface AuditEntry {
  actorUserId?: number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  details?: Record<string, unknown>;
}

/** O PostgreSQL é a única trilha de auditoria operacional do aplicativo. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  await centralQuery(
    "INSERT INTO portus_audit_log " +
    "(actor_user_id, station_code, action, resource_type, resource_id, details) " +
    "VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [
      entry.actorUserId ?? null,
      getRuntimeStationCode(),
      entry.action,
      entry.resourceType,
      entry.resourceId == null ? null : String(entry.resourceId),
      JSON.stringify(entry.details ?? {})
    ]
  );
}
