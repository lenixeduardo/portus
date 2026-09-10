import bcrypt from "bcryptjs";
import { getUserByUsername } from "../db/users-repo";
import type { User } from "../../shared/types";

let currentUser: User | null = null;
let lastActivityAt = 0;

// A sessão é mantida somente no processo principal. Este limite impede que uma
// estação deixada aberta continue operando sem supervisão.
export const SESSION_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

interface LoginAttempt {
  failures: number[];
  blockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

function loginKey(username: string): string {
  return username.trim().toLocaleLowerCase();
}

export function isLoginBlocked(username: string, now = Date.now()): boolean {
  const attempt = loginAttempts.get(loginKey(username));
  if (!attempt?.blockedUntil) return false;
  if (attempt.blockedUntil <= now) {
    loginAttempts.delete(loginKey(username));
    return false;
  }
  return true;
}

export function recordFailedLogin(username: string, now = Date.now()): void {
  const key = loginKey(username);
  const attempt = loginAttempts.get(key) ?? { failures: [] };
  attempt.failures = attempt.failures.filter((at) => now - at < LOGIN_WINDOW_MS);
  attempt.failures.push(now);
  if (attempt.failures.length >= LOGIN_MAX_FAILURES) {
    attempt.blockedUntil = now + LOGIN_BLOCK_MS;
    attempt.failures = [];
  }
  loginAttempts.set(key, attempt);
}

export function clearFailedLogins(username: string): void {
  loginAttempts.delete(loginKey(username));
}

export function login(username: string, password: string): User | null {
  const row = getUserByUsername(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  currentUser = {
    id: row.id,
    username: row.username,
    role: row.role ?? "admin",
    sectorCode: row.sector_code ?? "PRODUCTION",
    laboratoryProfile: row.laboratory_profile ?? undefined,
    createdAt: row.created_at
  };
  lastActivityAt = Date.now();
  clearFailedLogins(username);
  return currentUser;
}

export function logout(): void {
  currentUser = null;
  lastActivityAt = 0;
}

export function getCurrentUser(): User | null {
  if (currentUser && Date.now() - lastActivityAt >= SESSION_IDLE_TIMEOUT_MS) {
    logout();
  }
  return currentUser;
}

export function touchSession(): void {
  if (currentUser) lastActivityAt = Date.now();
}
