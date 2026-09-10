import type { User } from "./types";

export function isLaboratoryUser(user: Pick<User, "sectorCode">): boolean {
  return user.sectorCode === "LABORATORY";
}

export function canCaptureLaboratory(user: Pick<User, "sectorCode" | "laboratoryProfile">): boolean {
  return isLaboratoryUser(user) && user.laboratoryProfile === "capture";
}

export function canCloseLaboratory(user: Pick<User, "sectorCode" | "laboratoryProfile">): boolean {
  return isLaboratoryUser(user) && user.laboratoryProfile === "closure";
}
