import bcrypt from "bcryptjs";
import { all, get, run } from "./query";
import type { User } from "../../shared/types";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "operator";
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return { id: row.id, username: row.username, role: row.role ?? "admin", createdAt: row.created_at };
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

export function createUser(username: string, password: string, role: "admin" | "operator" = "operator"): User {
  const hash = bcrypt.hashSync(password, 10);
  const id = run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", username, hash, role);
  return getUser(id)!;
}

export function updateUserPassword(id: number, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id);
}

export function deleteUser(id: number): void {
  run("DELETE FROM users WHERE id = ?", id);
}

export function countUsers(): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM users")?.c ?? 0;
}

export function userHasReferences(id: number): boolean {
  if (get("SELECT 1 AS x FROM formulas WHERE created_by = ? LIMIT 1", id)) return true;
  return get("SELECT 1 AS x FROM batches WHERE created_by = ? LIMIT 1", id) != null;
}
