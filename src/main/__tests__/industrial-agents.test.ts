import { describe, expect, it } from "vitest";
import { IndustrialEventBus } from "../industrial/event-bus";
import {
  appendCrc,
  buildReadHoldingRegistersFrame,
  crc16Modbus,
  MockModbusTransport,
  ModbusCommunicationAgent,
  parseReadHoldingRegistersResponse
} from "../industrial/modbus-communication-agent";
import { DeviceParserAgent } from "../industrial/device-parser-agent";
import {
  DataStreamingAgent,
  MemoryReadingSink
} from "../industrial/data-streaming-agent";
import { MonitoringDiagnosticsAgent } from "../industrial/monitoring-diagnostics-agent";
import { IndustrialOrchestrator } from "../industrial/industrial-orchestrator";
import type { IndustrialDeviceConfig } from "../industrial/types";

const densimeter: IndustrialDeviceConfig = {
  id: "dens-1",
  name: "Densimetro bancada",
  type: "densimeter",
  unitId: 1,
  serial: {
    portPath: "COM3",
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    timeoutMs: 500
  },
  registers: {
    startAddress: 0,
    quantity: 2,
    scale: 1000,
    unit: "kg/m3",
    metric: "density"
  },
  pollIntervalMs: 1000
};

describe("industrial Modbus agent", () => {
  it("calcula CRC16 Modbus conhecido", () => {
    const frame = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
    expect(crc16Modbus(frame)).toBe(0xcdc5);
    expect(appendCrc(frame).toString("hex")).toBe("01030000000ac5cd");
  });

  it("monta request RTU para holding registers", () => {
    const frame = buildReadHoldingRegistersFrame(1, 0, 10);
    expect(frame.toString("hex")).toBe("01030000000ac5cd");
  });

  it("valida CRC e extrai registradores da resposta", () => {
    const body = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x00, 0x30, 0x39]);
    const response = appendCrc(body);
    expect(parseReadHoldingRegistersResponse(response)).toEqual([0, 12345]);
  });
});

describe("industrial orchestrator", () => {
  it("executa leitura mock, normaliza payload e publica no sink", async () => {
    const bus = new IndustrialEventBus();
    const sink = new MemoryReadingSink();
    const streaming = new DataStreamingAgent(
      bus,
      new Map([["erp", sink]]),
      [{ id: "erp", type: "event-bus", enabled: true }]
    );
    const modbus = new ModbusCommunicationAgent(
      bus,
      new Map([["dens-1", new MockModbusTransport([0, 12345])]])
    );
    const parser = new DeviceParserAgent(bus);
    const monitoring = new MonitoringDiagnosticsAgent(bus);
    const orchestrator = new IndustrialOrchestrator(bus, modbus, parser, streaming, monitoring);

    const reading = await orchestrator.pollOnce(densimeter);

    expect(reading).toMatchObject({
      device: "densimeter",
      value: 12.345,
      unit: "kg/m3",
      status: "connected",
      metric: "density"
    });
    expect(sink.readings).toHaveLength(1);
    expect(monitoring.snapshot()).toMatchObject([
      {
        deviceId: "dens-1",
        status: "connected",
        readingsCount: 1,
        failuresCount: 0,
        stabilityPercent: 100
      }
    ]);
  });
});
