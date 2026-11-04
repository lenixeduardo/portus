import type { User, OperationalSector } from "./types";

/** O setor administrativo nao e um setor de captura. */
export function getUserOperationalSector(user: Pick<User, "sectorCode">): OperationalSector {
  return user.sectorCode === "LABORATORY" ? "LABORATORY" : "PRODUCTION";
}

export function resolveCaptureSector(
  user: Pick<User, "role" | "sectorCode">,
  stationSector: OperationalSector
): OperationalSector {
  if (user.sectorCode === "ADMIN" && user.role !== "master" && user.role !== "supervisor") {
    throw new Error("O perfil administrativo não possui setor operacional de captura.");
  }
  // O setor operacional da leitura pertence à máquina, não à credencial.
  return stationSector;
}
