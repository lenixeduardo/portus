import Database from "better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "serial-reader.sqlite");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
