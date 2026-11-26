import type { User } from "./types";

/** Somente perfis administrativos autenticados gerenciam versões instaláveis. */
export function canManageUpdates(role?: User["role"] | null): boolean {
  return role === "admin" || role === "master";
}
