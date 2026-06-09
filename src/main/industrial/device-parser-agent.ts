import { createLog, IndustrialEventBus } from "./event-bus";
import type {
  IndustrialDeviceConfig,
  NormalizedIndustrialReading,
  RawIndustrialPayload
} from "./types";

export class DeviceParserAgent {
  constructor(private readonly bus: IndustrialEventBus) {}

  parse(
    payload: RawIndustrialPayload,
    device: IndustrialDeviceConfig
  ): NormalizedIndustrialReading {
    if (payload.registers.length === 0) {
      throw new Error(`Payload sem registradores para ${device.id}.`);
    }

    const rawValue = payload.registers.length >= 2
      ? (payload.registers[0] << 16) + payload.registers[1]
      : payload.registers[0];
    const scale = device.registers.scale ?? 1;
    const value = rawValue / scale;

    const reading: NormalizedIndustrialReading = {
      device: device.type,
      timestamp: payload.timestamp,
      value,
      unit: device.registers.unit,
      status: "connected",
      metric: device.registers.metric,
      raw: payload
    };

    this.bus.emit("reading", reading);
    this.bus.emit(
      "log",
      createLog("parser", "Payload industrial normalizado.", "info", reading, device.id)
    );
    return reading;
  }
}
