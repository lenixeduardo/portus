import bcrypt from "bcryptjs";
import { getDb } from "./connection";
import type { User } from "../../shared/types";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare("SELECT * FROM users ORDER BY username COLLATE NOCASE")
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function getUser(id: number): User | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function createUser(username: string, password: string): User {
  const hash = bcrypt.hashSync(password, 10);
  const info = getDb()
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hash);
  return getUser(Number(info.lastInsertRowid))!;
}

export function updateUserPassword(id: number, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
}

export function deleteUser(id: number): void {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function countUsers(): number {
  const r = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return r.c;
}

export function userHasReferences(id: number): boolean {
  const r1 = getDb()
    .prepare("SELECT 1 FROM formulas WHERE created_by = ? LIMIT 1")
    .get(id);
  if (r1) return true;
  const r2 = getDb()
    .prepare("SELECT 1 FROM batches WHERE created_by = ? LIMIT 1")
    .get(id);
  return r2 != null;
}
