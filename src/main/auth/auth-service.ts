import bcrypt from "bcryptjs";
import { centralQuery } from "../db/central-connection";
import { normalizeUserBarcode } from "../../shared/user-barcode";
import type { User } from "../../shared/types";

let currentUser: User | null = null;
let lastActivityAt = 0;

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

interface CentralCredentialRow {
  id: number | string;
  username: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  sector_code: "PRODUCTION" | "LABORATORY";
  laboratory_profile: "capture" | null;
  created_at: Date | string;
}
const CREDENTIAL_COLUMNS = "id, username, password_hash, display_name, role, " +
  "sector_code, laboratory_profile, created_at";

function establishSession(row: CentralCredentialRow): User {
  const user: User = {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name ?? undefined,
    role: row.role === "laboratory" ? "operator" : row.role as User["role"],
    sectorCode: row.sector_code,
    laboratoryProfile: row.laboratory_profile ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
  currentUser = user;
  lastActivityAt = Date.now();
  clearFailedLogins(user.username);
  return user;
}

export async function login(username: string, password: string): Promise<User | null> {
  // A verificação de credenciais é exclusivamente no PostgreSQL. Falhas
  // de conexão são propagadas e nunca caem no SQLite.
  const result = await centralQuery<CentralCredentialRow>(
    "SELECT " + CREDENTIAL_COLUMNS +
    " FROM users WHERE lower(username) = lower($1) AND active LIMIT 1",
    [username.trim()]
  );
  const row = result.rows[0];
  if (!row || row.password_hash === "managed-by-portus" ||
      !await bcrypt.compare(password, row.password_hash)) return null;
  return establishSession(row);
}

export async function loginByBarcode(barcodeValue: string): Promise<User | null> {
  const result = await centralQuery<CentralCredentialRow>(
    "SELECT " + CREDENTIAL_COLUMNS +
    " FROM users WHERE lower(barcode_value) = lower($1) AND active LIMIT 1",
    [normalizeUserBarcode(barcodeValue)]
  );
  return result.rows[0] ? establishSession(result.rows[0]) : null;
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
