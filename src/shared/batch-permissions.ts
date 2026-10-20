import type { UserRole } from "./types";

/** Perfis autorizados a reabrir lotes finalizados. A validação também ocorre no PostgreSQL. */
export function canReopenFinalizedBatch(role: UserRole): boolean {
  return role === "supervisor" || role === "master";
}

/** Operadores concluem lotes; somente Laboratório pode revogar a conclusão. */
export function canSetBatchCompleted(role: UserRole, sector: string, completed: boolean): boolean {
  return role === "master" || role === "supervisor" || (role === "operator" &&
    (sector === "PRODUCTION" || sector === "LABORATORY") &&
    (completed || sector === "LABORATORY"));
}
export function canFinalizeBatch(role: UserRole, sector: string): boolean {
  return role === "master" || role === "supervisor" || (role === "operator" && sector === "LABORATORY");
}
