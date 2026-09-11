import { existsSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { databaseDirectory, TestSerialPort } = vi.hoisted(() => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  const { mkdirSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const directory = join(tmpdir(), `portus-real-reading-${process.pid}-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  class HoistedTestSerialPort extends EventEmitter {
    isOpen = false;
    path: string;

    constructor(options: { path: string }) {
      super();
      this.path = options.path;
    }

    open(callback: (error: Error | null) => void): void {
      this.isOpen = true;
      callback(null);
    }

    close(callback?: (error: Error | null) => void): void {
      this.isOpen = false;
      if (callback) callback(null);
    }
  }
  return { databaseDirectory: directory, TestSerialPort: HoistedTestSerialPort };
});

vi.mock("serialport", () => ({ SerialPort: TestSerialPort }));
vi.mock("electron", () => ({
  app: { getPath: () => databaseDirectory },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBoxSync: () => 0 }
}));

import { openDb, closeDb, getDbFilePath } from "../db/connection";
import { runMigrations } from "../db/migrate";
import { run } from "../db/query";
import { createProduct } from "../db/products-repo";
import { createBatch, getBatchWithProduct } from "../db/batches-repo";
import { getBatchHistory, buildCsvContent } from "../db/history-repo";
import { injectManualReading, isActive, startCapture } from "../serial/capture-service";

describe("leitura real no banco local do PORTUS", () => {
  let batchId: number;

  beforeAll(async () => {
    process.env.PORTUS_DATABASE_MODE = "local";
    delete process.env.PORTUS_DATABASE_URL;

    await openDb();
    runMigrations();

    const userId = run(
      "INSERT INTO users (username, password_hash, role, sector_code) VALUES (?, ?, ?, ?)",
      "master.integration",
      "test-only",
      "master",
      "PRODUCTION"
    );
    const product = createProduct("Produto de validação local", "TESTE-LOCAL", userId);
    const equipmentId = run(
      `INSERT INTO equipments
        (name, port_path, enabled, slot_index, parse_regex, line_delimiter,
         stop_after_first_reading)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      "Balança de validação",
      "COM-PORTUS-TEST",
      1,
      1,
      "(?<value>[-+]?\\d+(?:[.,]\\d+)?)",
      "lf",
      0
    );
    expect(equipmentId).toBeGreaterThan(0);
    run("INSERT INTO settings (key, value) VALUES (?, ?)", "capture_timeout_seconds", "1");

    const batch = createBatch(product.id, "LOCAL-READING-001", userId);
    batchId = batch.id;
  });

  afterAll(() => {
    closeDb();
    if (existsSync(databaseDirectory)) rmSync(databaseDirectory, { recursive: true, force: true });
    delete process.env.PORTUS_DATABASE_MODE;
  });

  it("abre a captura, grava três valores e conclui a sessão", async () => {
    const started = await startCapture(batchId);
    expect(started.ok).toBe(true);
    expect(isActive()).toBe(true);

    expect(injectManualReading(1, "12.50")).toEqual({ ok: true, data: true });
    expect(injectManualReading(1, "12,65")).toEqual({ ok: true, data: true });
    expect(injectManualReading(1, "12.80 kg")).toEqual({ ok: true, data: true });

    const deadline = Date.now() + 3_000;
    while (isActive() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(isActive()).toBe(false);
    const batch = getBatchWithProduct(batchId);
    const history = getBatchHistory(batchId);
    expect(batch?.readingsCount).toBe(3);
    expect(history?.sessions).toHaveLength(1);
    expect(history?.sessions[0].status).toBe("completed");
    expect(history?.sessions[0].readings.map((reading) => reading.valueParsed)).toEqual([
      "12.50",
      "12.65",
      "12.80"
    ]);

    const csv = buildCsvContent(history!);
    expect(csv).toContain("12.50;12,50");
    expect(csv).toContain("12,65;12,65");
    expect(csv).toContain("12.80 kg;12,80");

    console.log(JSON.stringify({
      databaseFile: getDbFilePath(),
      batch: history?.batch,
      session: history?.sessions[0],
      csvRows: csv.split("\r\n").slice(1)
    }, null, 2));
  });
});
