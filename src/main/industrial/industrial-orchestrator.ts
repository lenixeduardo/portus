import { IndustrialEventBus } from "./event-bus";
import { DataStreamingAgent } from "./data-streaming-agent";
import { DeviceParserAgent } from "./device-parser-agent";
import { ModbusCommunicationAgent } from "./modbus-communication-agent";
import { MonitoringDiagnosticsAgent } from "./monitoring-diagnostics-agent";
import type { IndustrialDeviceConfig, NormalizedIndustrialReading } from "./types";

export class IndustrialOrchestrator {
  constructor(
    private readonly bus: IndustrialEventBus,
    private readonly modbus: ModbusCommunicationAgent,
    private readonly parser: DeviceParserAgent,
    private readonly streaming: DataStreamingAgent,
    private readonly monitoring: MonitoringDiagnosticsAgent
  ) {}

  async pollOnce(device: IndustrialDeviceConfig): Promise<NormalizedIndustrialReading> {
    this.monitoring.registerDevice(device);
    const started = Date.now();
    try {
      const payload = await this.modbus.readDevice(device);
      const reading = this.parser.parse(payload, device);
      await this.streaming.publish(reading);
      this.monitoring.recordReading(device.id, Date.now() - started, reading.timestamp);
      return reading;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes("crc") ? "crc_error" : "error";
      this.monitoring.recordFailure(device.id, status, message);
      throw err;
    }
  }

  onReading(listener: (reading: NormalizedIndustrialReading) => void): () => void {
    return this.bus.on("reading", listener);
  }
}
