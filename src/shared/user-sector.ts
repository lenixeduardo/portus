import type { User, OperationalSector } from "./types";

/** O setor administrativo nao e um setor de captura. */
export function getUserOperationalSector(user: Pick<User, "sectorCode">): OperationalSector {
  return user.sectorCode === "LABORATORY" ? "LABORATORY" : "PRODUCTION";
}

export function resolveCaptureSector(
  user: Pick<User, "role" | "sectorCode">,
  stationSector: OperationalSector
): OperationalSector {
  if (user.role === "master" || user.role === "supervisor") return stationSector;
  // Operadores seguem a própria credencial, independentemente da máquina.
  const userSector = getUserOperationalSector(user);
  if (user.sectorCode === "ADMIN") {
    throw new Error("O perfil administrativo não possui setor operacional de captura.");
  }
  return userSector;
}
