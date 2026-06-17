/**
 * PORTUS — Testes de integração do simulador serial
 *
 * Executa 3 testes em sequência:
 *   1. Formato de saída do simulador via porta serial real (socat)
 *   2. Parser de regex para todos os presets (lógica isolada, sem hardware)
 *   3. Pipeline completo: simulador → SerialPort → ReadlineParser → SQLite
 *
 * Requisito para testes 1 e 3: socat instalado (sudo apt install socat)
 * Uso: node dist/tools/sim-test.js
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "serialport";
import { execSync, spawn, ChildProcess } from "child_process";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// ─── Cores ANSI ───────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m"
};

// ─── Presets (espelho de serial-sim.ts) ───────────────────────────────────────

interface Preset {
  description: string;
  exampleRegex: string;
  generate(): string;
}

function rand(min: number, max: number, decimals: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

const PRESETS: Record<string, Preset> = {
  balanca: {
    description: "Balança analítica",
    exampleRegex: "(\\d+\\.\\d+)\\s*kg",
    generate: () => `  ${rand(0.001, 50, 4).toFixed(4)} kg\r\n`
  },
  ph: {
    description: "pH-metro",
    exampleRegex: "pH\\s*(\\d+\\.\\d+)",
    generate: () => `pH  ${rand(0, 14, 2).toFixed(2)}\r\n`
  },
  viscosimetro: {
    description: "Viscosímetro",
    exampleRegex: "(\\d+\\.\\d+)\\s*mPa",
    generate: () => `${rand(1, 5000, 1).toFixed(1)} mPa.s\r\n`
  },
  espectrofotometro: {
    description: "Espectrofotômetro",
    exampleRegex: "ABS[:\\s]*(\\d+\\.\\d+)",
    generate: () => `ABS:${rand(0, 3, 3).toFixed(3)}\r\n`
  },
  generico: {
    description: "Genérico",
    exampleRegex: "(\\d+\\.\\d+)",
    generate: () => `${rand(0, 9999, 4).toFixed(4)}\r\n`
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string[];
}

const pass = (msg: string) => `${C.green}✓${C.reset} ${msg}`;
const fail = (msg: string) => `${C.red}✗${C.reset} ${msg}`;
const note = (msg: string) => `${C.dim}  ${msg}${C.reset}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isSocatAvailable(): boolean {
  try {
    execSync("which socat", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── socat ────────────────────────────────────────────────────────────────────

interface SocatPair {
  port1: string;
  port2: string;
  kill(): void;
}

function createSocatPair(): Promise<SocatPair> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn("socat", ["-d", "-d", "pty,raw,echo=0", "pty,raw,echo=0"]);
    const ptys: string[] = [];
    const timeout = setTimeout(() => reject(new Error("socat: timeout aguardando PTYs")), 5000);

    proc.stderr!.on("data", (chunk: Buffer) => {
      for (const m of chunk.toString().matchAll(/PTY is (\/dev\/pts\/\d+)/g)) {
        if (!ptys.includes(m[1])) ptys.push(m[1]);
      }
      if (ptys.length >= 2) {
        clearTimeout(timeout);
        resolve({ port1: ptys[0], port2: ptys[1], kill: () => proc.kill() });
      }
    });

    proc.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

async function openPort(path: string): Promise<SerialPort> {
  const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
  await new Promise<void>((res, rej) => port.open((e) => (e ? rej(e) : res())));
  return port;
}

async function closePort(port: SerialPort): Promise<void> {
  if (port.isOpen) await new Promise<void>((res) => port.close(() => res()));
}

// ─── TEST 1: Formato de saída via porta serial real ───────────────────────────

async function testSimulatorOutput(): Promise<TestResult> {
  const result: TestResult = {
    name: "Formato de saída do simulador (socat + SerialPort)",
    passed: true,
    details: []
  };

  if (!isSocatAvailable()) {
    result.passed = false;
    result.details.push(fail("socat não disponível — instale: sudo apt install socat"));
    return result;
  }

  for (const [name, preset] of Object.entries(PRESETS)) {
    // Par de portas virgem por preset evita contaminação de buffer
    const pair = await createSocatPair();
    const samples: string[] = [];

    try {
      const reader = await openPort(pair.port1);
      const parser = reader.pipe(new ReadlineParser({ delimiter: "\n" }));

      const collected = new Promise<void>((res) => {
        parser.on("data", (line: string) => {
          samples.push(line.replace(/\r$/, "").trim());
          if (samples.length >= 3) res();
        });
      });

      const writer = await openPort(pair.port2);
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((res) => writer.write(preset.generate(), () => res()));
        await sleep(60);
      }

      await Promise.race([collected, sleep(2000)]);
      await closePort(writer);
      await closePort(reader);

      if (samples.length >= 3) {
        result.details.push(pass(`${name.padEnd(18)} 3/3 amostras recebidas via serial`));
        for (const s of samples.slice(0, 3)) result.details.push(note(`"${s}"`));
      } else {
        result.passed = false;
        result.details.push(fail(`${name.padEnd(18)} ${samples.length}/3 amostras recebidas`));
      }
    } finally {
      pair.kill();
      await sleep(150);
    }
  }

  return result;
}

// ─── TEST 2: Parser de regex (lógica isolada) ─────────────────────────────────

async function testRegexParser(): Promise<TestResult> {
  const result: TestResult = {
    name: "Parser de regex — lógica isolada (sem hardware)",
    passed: true,
    details: []
  };

  function parseValue(raw: string, regexSrc: string): string | null {
    try {
      const m = raw.match(new RegExp(regexSrc));
      return m ? (m[1] ?? m[0]) : null;
    } catch {
      return null;
    }
  }

  const SAMPLES = 20;

  for (const [name, preset] of Object.entries(PRESETS)) {
    const failures: string[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const raw = preset.generate().replace(/\r?\n$/, "");
      const parsed = parseValue(raw, preset.exampleRegex);
      if (parsed === null) {
        failures.push(`"${raw}" não casou com /${preset.exampleRegex}/`);
      } else if (!/^\d+\.\d+$/.test(parsed)) {
        failures.push(`"${raw}" → valor não numérico: "${parsed}"`);
      }
    }

    if (failures.length === 0) {
      const example = preset.generate().replace(/\r?\n$/, "");
      const parsed = parseValue(example, preset.exampleRegex);
      result.details.push(pass(`${name.padEnd(18)} ${SAMPLES}/${SAMPLES} amostras parseadas`));
      result.details.push(note(`"${example}" → "${parsed}"`));
    } else {
      result.passed = false;
      result.details.push(fail(`${name.padEnd(18)} ${failures.length} falha(s) em ${SAMPLES} amostras`));
      for (const f of failures.slice(0, 2)) result.details.push(note(f));
    }
  }

  return result;
}

// ─── TEST 3: Pipeline completo sim → SerialPort → ReadlineParser → SQLite ─────

async function testFullPipeline(): Promise<TestResult> {
  const result: TestResult = {
    name: "Pipeline completo (socat + SerialPort + ReadlineParser + SQLite)",
    passed: true,
    details: []
  };

  if (!isSocatAvailable()) {
    result.passed = false;
    result.details.push(fail("socat não disponível — instale: sudo apt install socat"));
    return result;
  }

  const dbPath = path.join(process.env["TMPDIR"] ?? "/tmp", `sim-test-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preset TEXT NOT NULL,
      value_raw TEXT NOT NULL,
      value_parsed TEXT,
      captured_at TEXT NOT NULL
    )
  `);
  const insert = db.prepare(
    "INSERT INTO readings (preset, value_raw, value_parsed, captured_at) VALUES (?, ?, ?, ?)"
  );

  function parseValue(raw: string, regexSrc: string): string | null {
    try {
      const m = raw.match(new RegExp(regexSrc));
      return m ? (m[1] ?? m[0]) : null;
    } catch {
      return null;
    }
  }

  const READINGS = 5;

  for (const [name, preset] of Object.entries(PRESETS)) {
    const pair = await createSocatPair();

    try {
      const reader = await openPort(pair.port1);
      const parser = reader.pipe(new ReadlineParser({ delimiter: "\n" }));

      let stored = 0;
      const done = new Promise<void>((res) => {
        parser.on("data", (line: string) => {
          const raw = String(line).replace(/\r$/, "").trim();
          if (!raw) return;
          const parsed = parseValue(raw, preset.exampleRegex);
          insert.run(name, raw, parsed, new Date().toISOString());
          stored++;
          if (stored >= READINGS) res();
        });
      });

      const writer = await openPort(pair.port2);
      for (let i = 0; i < READINGS; i++) {
        await new Promise<void>((res) => writer.write(preset.generate(), () => res()));
        await sleep(80);
      }

      await Promise.race([done, sleep(3000)]);
      await closePort(writer);
      await closePort(reader);

      const rows = db
        .prepare("SELECT * FROM readings WHERE preset = ? ORDER BY id")
        .all(name) as Array<{ value_raw: string; value_parsed: string | null }>;

      const withParsed = rows.filter((r) => r.value_parsed !== null).length;

      if (rows.length >= READINGS && withParsed === rows.length) {
        result.details.push(
          pass(`${name.padEnd(18)} ${rows.length} leituras gravadas, ${withParsed} com valor parseado`)
        );
        result.details.push(note(`raw="${rows[0].value_raw}" → parsed="${rows[0].value_parsed}"`));
      } else {
        result.passed = false;
        const detail =
          rows.length < READINGS
            ? `apenas ${rows.length}/${READINGS} leituras gravadas`
            : `${rows.length - withParsed} leitura(s) sem valor parseado`;
        result.details.push(fail(`${name.padEnd(18)} ${detail}`));
      }
    } finally {
      pair.kill();
      await sleep(150);
    }
  }

  const total = (db.prepare("SELECT COUNT(*) as n FROM readings").get() as { n: number }).n;
  result.details.push(note(`DB: ${total} leituras gravadas em ${Object.keys(PRESETS).length} presets`));

  db.close();
  fs.unlinkSync(dbPath);
  return result;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}PORTUS — Testes de integração do simulador${C.reset}`);
  console.log(`${"─".repeat(54)}\n`);

  const tests = [testSimulatorOutput, testRegexParser, testFullPipeline];
  const results: TestResult[] = [];

  for (const [i, test] of tests.entries()) {
    const r = await test();
    results.push(r);
    const badge = r.passed
      ? `${C.green}PASSOU${C.reset}`
      : `${C.red}FALHOU${C.reset}`;
    console.log(`${C.bold}Teste ${i + 1} [${badge}${C.bold}] ${r.name}${C.reset}`);
    for (const d of r.details) console.log(`  ${d}`);
    console.log();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log("─".repeat(54));

  if (passed === tests.length) {
    console.log(`${C.bold}${C.green}Resultado: ${passed}/${tests.length} testes passaram${C.reset}\n`);
  } else {
    console.log(`${C.bold}${C.red}Resultado: ${passed}/${tests.length} testes passaram${C.reset}\n`);
    process.exit(1);
  }
}

run().catch((e: unknown) => {
  console.error("Erro fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
