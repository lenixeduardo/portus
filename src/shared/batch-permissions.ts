import type { UserRole } from "./types";

/** Perfis autorizados a reabrir lotes finalizados. A validação também ocorre no PostgreSQL. */
export function canReopenFinalizedBatch(role: UserRole): boolean {
  return role === "admin" || role === "supervisor" || role === "master";
}
