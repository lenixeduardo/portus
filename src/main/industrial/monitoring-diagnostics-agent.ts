import { createLog, IndustrialEventBus } from "./event-bus";
import type { DeviceDiagnostic, IndustrialDeviceConfig, IndustrialStatus } from "./types";

interface MutableDiagnostic extends DeviceDiagnostic {
  totalEvents: number;
}

export class MonitoringDiagnosticsAgent {
  private readonly diagnostics = new Map<string, MutableDiagnostic>();

  constructor(private readonly bus: IndustrialEventBus) {}

  registerDevice(device: IndustrialDeviceConfig): void {
    if (this.diagnostics.has(device.id)) return;
    this.diagnostics.set(device.id, {
      deviceId: device.id,
      status: "waiting",
      readingsCount: 0,
      failuresCount: 0,
      reconnectsCount: 0,
      stabilityPercent: 100,
      totalEvents: 0
    });
  }

  recordReading(deviceId: string, responseMs: number, timestamp = new Date().toISOString()): void {
    const diagnostic = this.ensure(deviceId);
    diagnostic.status = "connected";
    diagnostic.lastReadingAt = timestamp;
    diagnostic.lastResponseMs = responseMs;
    diagnostic.readingsCount += 1;
    diagnostic.totalEvents += 1;
    diagnostic.stabilityPercent = this.calculateStability(diagnostic);
    this.publish(diagnostic);
  }

  recordFailure(deviceId: string, status: IndustrialStatus, message: string): void {
    const diagnostic = this.ensure(deviceId);
    diagnostic.status = status;
    diagnostic.failuresCount += 1;
    diagnostic.totalEvents += 1;
    diagnostic.stabilityPercent = this.calculateStability(diagnostic);
    this.publish(diagnostic);
    this.bus.emit("log", createLog("monitoring", message, "error", { status }, deviceId));
  }

  recordReconnect(deviceId: string): void {
    const diagnostic = this.ensure(deviceId);
    diagnostic.reconnectsCount += 1;
    this.bus.emit("log", createLog("monitoring", "Reconexao registrada.", "warn", undefined, deviceId));
    this.publish(diagnostic);
  }

  snapshot(): DeviceDiagnostic[] {
    return Array.from(this.diagnostics.values()).map(({ totalEvents: _totalEvents, ...d }) => d);
  }

  private ensure(deviceId: string): MutableDiagnostic {
    const existing = this.diagnostics.get(deviceId);
    if (existing) return existing;
    const created: MutableDiagnostic = {
      deviceId,
      status: "waiting",
      readingsCount: 0,
      failuresCount: 0,
      reconnectsCount: 0,
      stabilityPercent: 100,
      totalEvents: 0
    };
    this.diagnostics.set(deviceId, created);
    return created;
  }

  private calculateStability(diagnostic: MutableDiagnostic): number {
    if (diagnostic.totalEvents === 0) return 100;
    return Math.max(0, Math.round((diagnostic.readingsCount / diagnostic.totalEvents) * 100));
  }

  private publish(diagnostic: MutableDiagnostic): void {
    const { totalEvents: _totalEvents, ...snapshot } = diagnostic;
    this.bus.emit("diagnostic", snapshot);
  }
}
