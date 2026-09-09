import bcrypt from "bcryptjs";
import { all, get, run } from "./query";
import type { LaboratoryProfile, User, UserSector } from "../../shared/types";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "operator";
  sector_code: UserSector;
  laboratory_profile: LaboratoryProfile | null;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role ?? "admin",
    sectorCode: row.sector_code ?? "PRODUCTION",
    laboratoryProfile: row.laboratory_profile ?? undefined,
    createdAt: row.created_at
  };
}

export function listUsers(): User[] {
  return all<UserRow>("SELECT * FROM users ORDER BY username COLLATE NOCASE").map(rowToUser);
}

export function getUser(id: number): User | null {
  const row = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
  return row ? rowToUser(row) : null;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE username = ?", username);
}

export function createUser(
  username: string,
  password: string,
  role: "admin" | "operator" = "operator",
  sectorCode: UserSector = "PRODUCTION",
  laboratoryProfile?: LaboratoryProfile
): User {
  const hash = bcrypt.hashSync(password, 10);
  const id = run(
    "INSERT INTO users (username, password_hash, role, sector_code, laboratory_profile) VALUES (?, ?, ?, ?, ?)",
    username, hash, role, sectorCode, laboratoryProfile ?? null
  );
  return getUser(id)!;
}

export function updateUserPassword(id: number, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id);
}

export function reassignUserReferences(userId: number, newUserId: number): void {
  run("UPDATE batches SET created_by = ? WHERE created_by = ?", newUserId, userId);
  run("UPDATE products SET created_by = ? WHERE created_by = ?", newUserId, userId);
}

export function deleteUser(id: number): void {
  run("DELETE FROM users WHERE id = ?", id);
}

export function countUsers(): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM users")?.c ?? 0;
}
