import type { User, OperationalSector } from "./types";

/** O setor administrativo nao e um setor de captura. */
export function getUserOperationalSector(user: Pick<User, "sectorCode">): OperationalSector {
  return user.sectorCode === "LABORATORY" ? "LABORATORY" : "PRODUCTION";
}

export function resolveCaptureSector(
  user: Pick<User, "role" | "sectorCode">,
  stationSector: OperationalSector
): OperationalSector {
  if (user.role === "master") return stationSector;
  const userSector = getUserOperationalSector(user);
  if (user.sectorCode === "ADMIN" || userSector !== stationSector) {
    throw new Error("O setor do computador difere do perfil operacional do usuário.");
  }
  return userSector;
}
