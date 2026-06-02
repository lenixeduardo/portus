import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startCapture, cancelCapture, isActive } from "../serial/capture-service";
import * as captureRepo from "../db/capture-repo";

// ─── Stubs hoisted: disponíveis nas factories de vi.mock e nos testes ─────────

const { MockPort, portRegistry } = vi.hoisted(() => {
  const { EventEmitter } = require("events") as typeof import("events");
  const registry = new Map<string, any>();

  class MockPort extends EventEmitter {
    isOpen = false;
    path: string;

    constructor(opts: { path: string; [k: string]: unknown }) {
      super();
      this.path = opts.path;
      registry.set(opts.path, this);
    }

    open(cb: (err: Error | null) => void): void { this.isOpen = true; cb(null); }
    close(cb?: (err: Error | null) => void): void {
      if (this.isOpen) { this.isOpen = false; this.emit("close"); }
      if (cb) cb(null);
    }
    /** Simula um chunk de bytes chegando nesta porta. */
    send(chunk: string): void { this.emit("data", Buffer.from(chunk, "utf8")); }
  }

  return { MockPort, portRegistry: registry };
});

// ─── Mocks de módulos ─────────────────────────────────────────────────────────

vi.mock("serialport", () => ({ SerialPort: MockPort }));
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../db/settings-repo", () => ({ getCaptureTimeoutSeconds: () => 30 }));

vi.mock("../db/batches-repo", () => ({
  // batchId 99 → lote fechado; 0 → inexistente; demais → aberto
  getBatchWithProduct: (id: number) =>
    id === 0
      ? null
      : { id, code: String(id), productId: 1, status: id === 99 ? "closed" : "open", openedAt: "", createdBy: 1, productName: "x", operatorName: "y", readingsCount: 0 }
}));

vi.mock("../db/equipments-repo", () => ({
  listEquipments: () => [
    { id: 1, name: "Equipamento 1", portPath: "COM1", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 0, lineDelimiter: "lf" },
    { id: 2, name: "Equipamento 2", portPath: "COM2", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 1, lineDelimiter: "lf" },
    { id: 3, name: "Equipamento 3", portPath: "COM3", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 2, lineDelimiter: "lf" },
    { id: 4, name: "Equipamento 4", portPath: "COM4", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 3, lineDelimiter: "lf" },
    { id: 5, name: "Equipamento 5", portPath: "COM5", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 4, lineDelimiter: "lf" }
  ]
}));

vi.mock("../db/capture-repo", () => {
  let seq = 0;
  return {
    createCaptureSession: vi.fn((_batchId: number, timeoutSeconds: number) => ({
      id: ++seq,
      batchId: _batchId,
      startedAt: "",
      timeoutSeconds,
      status: "active" as const
    })),
    completeCaptureSession: vi.fn(),
    cancelCaptureSession: vi.fn(),
    insertReading: vi.fn((p: {
      batchId: number;
      equipmentId: number;
      valueRaw: string;
      valueParsed: string | null;
      captureSessionId: number;
      parseFailureReason?: string | null;
      parseRegexUsed?: string | null;
    }) => ({ id: ++seq, capturedAt: "", ...p }))
  };
});

// ─── Dados dos cenários ───────────────────────────────────────────────────────

const PORT_PATHS = ["COM1", "COM2", "COM3", "COM4", "COM5"] as const;

const scenarios = [
  { productName: "teste Eduardo 1", batchId: 1, signalBase: "1" },
  { productName: "teste Eduardo 2", batchId: 2, signalBase: "2" },
  { productName: "teste Eduardo 3", batchId: 3, signalBase: "3" }
] as const;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Leitura simultânea em cinco portas — três produtos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    portRegistry.clear();
    vi.mocked(captureRepo.insertReading).mockClear();
  });

  afterEach(async () => {
    if (isActive()) await cancelCapture();
    vi.useRealTimers();
  });

  for (const { productName, batchId, signalBase } of scenarios) {
    it(`produto "${productName}": 5 sinais com prefixo "${signalBase}" → 5 leituras gravadas`, async () => {
      const result = await startCapture(batchId);
      expect(result.ok, "startCapture deve ter sucesso").toBe(true);
      if (!result.ok) return;

      expect(result.data.slots).toHaveLength(5);
      expect(
        result.data.slots.every((s) => s.status === "open"),
        "todos os slots devem estar abertos"
      ).toBe(true);

      // Envia um sinal terminado em "\n" em cada porta
      for (const [i, path] of PORT_PATHS.entries()) {
        const port = portRegistry.get(path);
        expect(port, `porta ${path} deve estar registrada`).toBeDefined();
        port!.send(`${signalBase}.${String(i + 1).padStart(2, "0")}\n`);
      }

      const insertMock = vi.mocked(captureRepo.insertReading);
      expect(insertMock, "deve gravar exatamente 5 leituras").toHaveBeenCalledTimes(5);

      const calls = insertMock.mock.calls.map((c) => c[0]);
      expect(calls.every((c) => c.batchId === batchId), "lote correto").toBe(true);
      expect(
        calls.every((c) => c.valueRaw.startsWith(`${signalBase}.`)),
        `valores começam com "${signalBase}."`
      ).toBe(true);

      const uniqueEquipments = new Set(calls.map((c) => c.equipmentId));
      expect(uniqueEquipments.size, "uma leitura por slot").toBe(5);

      await cancelCapture();
    });
  }
});

// ─── Robustez de captura ────────────────────────────────────────────────────

describe("Robustez do núcleo de captura", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    portRegistry.clear();
    vi.mocked(captureRepo.insertReading).mockClear();
  });

  afterEach(async () => {
    if (isActive()) await cancelCapture();
    vi.useRealTimers();
  });

  it("rejeita iniciar captura para lote inexistente", async () => {
    const res = await startCapture(0);
    expect(res.ok).toBe(false);
    expect(isActive()).toBe(false);
  });

  it("rejeita iniciar captura para lote já finalizado", async () => {
    const res = await startCapture(99);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/finalizad/i);
    expect(isActive()).toBe(false);
  });

  it("agrega chunks fragmentados em uma única leitura", async () => {
    const res = await startCapture(1);
    expect(res.ok).toBe(true);
    const port = portRegistry.get("COM1")!;
    port.send("1.2");
    expect(vi.mocked(captureRepo.insertReading)).toHaveBeenCalledTimes(0);
    port.send("34\n");
    const calls = vi.mocked(captureRepo.insertReading).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].valueRaw).toBe("1.234");
    await cancelCapture();
  });

  it("faz flush da linha parcial (sem terminador) ao encerrar", async () => {
    const res = await startCapture(1);
    expect(res.ok).toBe(true);
    const port = portRegistry.get("COM2")!;
    port.send("9.99"); // sem "\n": fica no buffer
    expect(vi.mocked(captureRepo.insertReading)).toHaveBeenCalledTimes(0);
    await cancelCapture();
    const calls = vi.mocked(captureRepo.insertReading).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].valueRaw).toBe("9.99");
  });

  it("normaliza vírgula decimal no valor parseado", async () => {
    const res = await startCapture(1);
    expect(res.ok).toBe(true);
    const port = portRegistry.get("COM3")!;
    port.send("1,234\n");
    const call = vi.mocked(captureRepo.insertReading).mock.calls[0][0];
    expect(call.valueRaw).toBe("1,234");
    expect(call.valueParsed).toBe("1.234");
    await cancelCapture();
  });
});
