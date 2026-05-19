import bcrypt from "bcryptjs";
import { get, run } from "./query";

const DEFAULT_EQUIPMENTS = [
  "Espectrofotômetro",
  "Balança",
  "Viscosímetro",
  "pH-metro",
  "Refratômetro",
  "Reserva"
];

export function seedInitialData(): void {
  const userCount = get<{ c: number }>("SELECT COUNT(*) AS c FROM users");
  if ((userCount?.c ?? 0) === 0) {
    const hash = bcrypt.hashSync("admin", 10);
    run("INSERT INTO users (username, password_hash) VALUES (?, ?)", "admin", hash);
    console.log("[db] seeded user: admin / admin");
  }

  const equipCount = get<{ c: number }>("SELECT COUNT(*) AS c FROM equipments");
  if ((equipCount?.c ?? 0) === 0) {
    DEFAULT_EQUIPMENTS.forEach((name, i) => {
      run(
        "INSERT INTO equipments (name, slot_index, enabled) VALUES (?, ?, ?)",
        name,
        i + 1,
        i < 5 ? 1 : 0
      );
    });
    console.log("[db] seeded 6 equipment slots");
  }

  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    "capture_timeout_seconds",
    "30"
  );

  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    "barcode_regex",
    "^(?<product>.+)-(?<batch_code>[^-]+)$"
  );
}
