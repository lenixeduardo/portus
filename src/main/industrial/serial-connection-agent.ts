import { SerialPort } from "serialport";
import { createLog, IndustrialEventBus } from "./event-bus";
import type { SerialConnectionConfig } from "./types";
import type { SerialPortInfo } from "../../shared/ipc";

const ALLOWED_BAUD = new Set([1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]);

export class SerialConnectionAgent {
  constructor(private readonly bus: IndustrialEventBus) {}

  async discoverPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list();
    const mapped = ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      productId: p.productId,
      vendorId: p.vendorId
    }));
    this.bus.emit("log", createLog("serial", `${mapped.length} porta(s) COM detectada(s).`));
    return mapped;
  }

  validateConfig(config: SerialConnectionConfig): string | null {
    if (!config.portPath.trim()) return "Porta COM obrigatoria.";
    if (!ALLOWED_BAUD.has(config.baudRate)) return "Baud rate invalido.";
    if (![5, 6, 7, 8].includes(config.dataBits)) return "Data bits invalido.";
    if (![1, 2].includes(config.stopBits)) return "Stop bits invalido.";
    if (!["none", "even", "odd"].includes(config.parity)) return "Paridade invalida.";
    if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 100) return "Timeout invalido.";
    return null;
  }

  async testConnection(config: SerialConnectionConfig): Promise<boolean> {
    const validation = this.validateConfig(config);
    if (validation) {
      this.bus.emit("log", createLog("serial", validation, "error", config));
      return false;
    }

    const port = new SerialPort({
      path: config.portPath,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      autoOpen: false
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout abrindo porta.")), config.timeoutMs);
        port.open((err) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      });
      this.bus.emit("log", createLog("serial", "Teste de conexao serial aprovado.", "info", config));
      return true;
    } catch (err) {
      this.bus.emit(
        "log",
        createLog("serial", "Teste de conexao serial falhou.", "error", {
          config,
          error: err instanceof Error ? err.message : String(err)
        })
      );
      return false;
    } finally {
      if (port.isOpen) {
        await new Promise<void>((resolve) => port.close(() => resolve()));
      }
    }
  }
}
