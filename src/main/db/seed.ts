import bcrypt from "bcryptjs";
import { getDb } from "./connection";

const DEFAULT_EQUIPMENTS = [
  "Espectrofotômetro",
  "Balança",
  "Viscosímetro",
  "pH-metro",
  "Refratômetro",
  "Reserva"
];

export function seedInitialData(): void {
  const db = getDb();

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (userCount.c === 0) {
    const hash = bcrypt.hashSync("admin", 10);
    db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("admin", hash);
    console.log("[db] seeded user: admin / admin");
  }

  const equipCount = db.prepare("SELECT COUNT(*) AS c FROM equipments").get() as { c: number };
  if (equipCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO equipments (name, slot_index, enabled) VALUES (?, ?, ?)"
    );
    const tx = db.transaction(() => {
      DEFAULT_EQUIPMENTS.forEach((name, i) => {
        insert.run(name, i + 1, i < 5 ? 1 : 0);
      });
    });
    tx();
    console.log("[db] seeded 6 equipment slots");
  }

  const settings: Array<[string, string]> = [["capture_timeout_seconds", "30"]];
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  );
  settings.forEach(([k, v]) => upsert.run(k, v));
}
