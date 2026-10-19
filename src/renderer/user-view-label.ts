import type { User } from "../shared/types";

/**
 * Exibe o perfil Supervisor de forma independente do setor operacional.
 * O setor continua sendo usado para as autorizações e fluxos de captura.
 */
export function getUserViewLabel(
  role?: User["role"],
  sectorCode?: User["sectorCode"]
): string {
  if (role === "supervisor") return "Supervisor";
  if (role === "master" || role === "admin" || sectorCode === "ADMIN") return "Admin";
  return sectorCode === "LABORATORY" ? "Laboratório" : "Produção";
}
