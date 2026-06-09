import { app } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database as SqlJsDatabase, SqlJsStatic } from "sql.js";

let db: SqlJsDatabase | null = null;
let dbFilePath: string | null = null;
let SQL: SqlJsStatic | null = null;

async function initSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const sqlJsModule = await import("sql.js");
  const initSqlJsFn = (sqlJsModule as any).default ?? sqlJsModule;
  SQL = await (initSqlJsFn as any)();
  return SQL!;
}

export async function openDb(): Promise<SqlJsDatabase> {
  if (db) return db;
  const sqlJs = await initSqlJs();
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  dbFilePath = join(dir, "serial-reader.sqlite");
  const fileData = existsSync(dbFilePath) ? readFileSync(dbFilePath) : null;
  db = fileData ? new sqlJs.Database(fileData) : new sqlJs.Database();
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized — call openDb() first");
  return db;
}

export function persistDb(): void {
  if (!db || !dbFilePath) return;
  const data = db.export();
  writeFileSync(dbFilePath, Buffer.from(data));
}

export function getDbFilePath(): string | null {
  return dbFilePath;
}

export function backupDbTo(targetPath: string): void {
  if (!dbFilePath) throw new Error("Database not initialized — call openDb() first");
  persistDb();
  copyFileSync(dbFilePath, targetPath);
}

export function closeDb(): void {
  if (db) {
    persistDb();
    db.close();
    db = null;
  }
}
