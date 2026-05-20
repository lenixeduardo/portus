import bcrypt from "bcryptjs";
import { getUserByUsername } from "../db/users-repo";
import type { User } from "../../shared/types";

let currentUser: User | null = null;

export function login(username: string, password: string): User | null {
  const row = getUserByUsername(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  currentUser = { id: row.id, username: row.username, role: (row as any).role ?? "admin", createdAt: row.created_at };
  return currentUser;
}

export function logout(): void {
  currentUser = null;
}

export function getCurrentUser(): User | null {
  return currentUser;
}
