import bcrypt from "bcryptjs";
import { getDb } from "../db/connection";
import type { User } from "../../shared/types";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

let currentUser: User | null = null;

function rowToUser(row: UserRow): User {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function login(username: string, password: string): User | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  currentUser = rowToUser(row);
  return currentUser;
}

export function logout(): void {
  currentUser = null;
}

export function getCurrentUser(): User | null {
  return currentUser;
}
