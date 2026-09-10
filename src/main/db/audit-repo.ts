import { run } from "./query";

export interface AuditEntry {
  actorUserId?: number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  details?: Record<string, unknown>;
}

/** Registro local, append-only, para rastreabilidade operacional. */
export function logAudit(entry: AuditEntry): void {
  run(
    `INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, details_json)
     VALUES (?, ?, ?, ?, ?)`,
    entry.actorUserId ?? null,
    entry.action,
    entry.resourceType,
    entry.resourceId == null ? null : String(entry.resourceId),
    entry.details ? JSON.stringify(entry.details) : null
  );
}
