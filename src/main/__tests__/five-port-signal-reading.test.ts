import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startCapture, cancelCapture, isActive } from "../serial/capture-service";
import * as captureRepo from "../db/capture-repo";

// ─── Stubs hoisted: disponíveis nas factories de vi.mock e nos testes ─────────

const { MockPort, MockParser, portRegistry } = vi.hoisted(() => {
  const { EventEmitter } = require("events") as typeof import("events");
  const registry = new Map<string, any>();

  class MockParser extends EventEmitter {}

  class MockPort extends EventEmitter {
    isOpen = false;
    path: string;
    parser: any;

    constructor(opts: { path: string; [k: string]: unknown }) {
      super();
      this.path = opts.path;
      this.parser = new MockParser();
      registry.set(opts.path, this);
    }

    pipe(p: any): any { this.parser = p; return p; }
    open(cb: (err: Error | null) => void): void { this.isOpen = true; cb(null); }
    close(): void {
      if (this.isOpen) { this.isOpen = false; this.emit("close"); }
    }
    /** Simula uma linha de dados chegando nesta porta. */
    send(line: string): void { this.parser.emit("data", line); }
  }

  return { MockPort, MockParser, portRegistry: registry };
});

// ─── Mocks de módulos ─────────────────────────────────────────────────────────

vi.mock("serialport", () => ({ SerialPort: MockPort }));
vi.mock("@serialport/parser-readline", () => ({ ReadlineParser: MockParser }));
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../db/settings-repo", () => ({ getCaptureTimeoutSeconds: () => 30 }));

vi.mock("../db/equipments-repo", () => ({
  listEquipments: () => [
    { id: 1, name: "Equipamento 1", portPath: "COM1", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 0 },
    { id: 2, name: "Equipamento 2", portPath: "COM2", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 1 },
    { id: 3, name: "Equipamento 3", portPath: "COM3", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 2 },
    { id: 4, name: "Equipamento 4", portPath: "COM4", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 3 },
    { id: 5, name: "Equipamento 5", portPath: "COM5", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", enabled: true, slotIndex: 4 },
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

// Produto "teste Eduardo N" → lote batchId N → sinais derivados de N
const scenarios = [
  { productName: "teste Eduardo 1", batchId: 1, signalBase: "1" },
  { productName: "teste Eduardo 2", batchId: 2, signalBase: "2" },
  { productName: "teste Eduardo 3", batchId: 3, signalBase: "3" },
] as const;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Leitura simultânea em cinco portas — três produtos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    portRegistry.clear();
    vi.mocked(captureRepo.insertReading).mockClear();
  });

  afterEach(() => {
    if (isActive()) cancelCapture();
    vi.useRealTimers();
  });

  for (const { productName, batchId, signalBase } of scenarios) {
    it(`produto "${productName}": 5 sinais com prefixo "${signalBase}" → 5 leituras gravadas`, async () => {
      const result = await startCapture(batchId);
      expect(result.ok, "startCapture deve ter sucesso").toBe(true);
      if (!result.ok) return;

      // Cinco slots devem ter aberto com sucesso
      expect(result.data.slots).toHaveLength(5);
      expect(
        result.data.slots.every((s) => s.status === "open"),
        "todos os slots devem estar abertos"
      ).toBe(true);

      // Envia um sinal em cada porta simultaneamente
      for (const [i, path] of PORT_PATHS.entries()) {
        const port = portRegistry.get(path);
        expect(port, `porta ${path} deve estar registrada`).toBeDefined();
        port!.send(`${signalBase}.${String(i + 1).padStart(2, "0")}`);
      }

      const insertMock = vi.mocked(captureRepo.insertReading);

      // Uma leitura por slot deve ser gravada imediatamente (sem debounce no banco)
      expect(insertMock, "deve gravar exatamente 5 leituras").toHaveBeenCalledTimes(5);

      const calls = insertMock.mock.calls.map((c) => c[0]);

      // Todas vinculadas ao lote correto
      expect(
        calls.every((c) => c.batchId === batchId),
        "todas as leituras devem referenciar o lote ativo"
      ).toBe(true);

      // Todos os valores recebidos começam com o prefixo esperado
      expect(
        calls.every((c) => c.valueRaw.startsWith(`${signalBase}.`)),
        `todos os valores devem começar com "${signalBase}."`
      ).toBe(true);

      // Sem leituras duplicadas no mesmo slot — cinco equipamentos distintos
      const uniqueEquipments = new Set(calls.map((c) => c.equipmentId));
      expect(uniqueEquipments.size, "cada slot deve contribuir com exatamente uma leitura").toBe(5);

      cancelCapture();
    });
  }
});
