import bcrypt from "bcryptjs";
import { get, run } from "./query";
import type { LineDelimiter } from "../../shared/types";

// Regex genérica que captura o primeiro número (inteiro ou decimal, vírgula ou
// ponto) da linha no grupo nomeado `value`. O operador refina por equipamento
// nas Configurações — o espectrofotômetro, por enviar múltiplos campos numa
// linha, normalmente precisa de uma regex ancorada no campo de absorbância.
const GENERIC_NUMBER_REGEX = "(?<value>[-+]?\\d+(?:[.,]\\d+)?)";

interface SeedEquipment {
  name: string;
  enabled: boolean;
  regex: string;
  delimiter: LineDelimiter;
}

const DEFAULT_EQUIPMENTS: SeedEquipment[] = [
  { name: "Espectrofotômetro", enabled: true, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" },
  { name: "Balança", enabled: true, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" },
  { name: "Viscosímetro", enabled: true, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" },
  { name: "pH-metro", enabled: true, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" },
  { name: "Refratômetro", enabled: true, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" },
  { name: "Reserva", enabled: false, regex: GENERIC_NUMBER_REGEX, delimiter: "lf" }
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
    DEFAULT_EQUIPMENTS.forEach((eq, i) => {
      run(
        "INSERT INTO equipments (name, slot_index, enabled, parse_regex, line_delimiter) VALUES (?, ?, ?, ?, ?)",
        eq.name,
        i + 1,
        eq.enabled ? 1 : 0,
        eq.regex,
        eq.delimiter
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
