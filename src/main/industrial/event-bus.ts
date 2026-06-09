import { EventEmitter } from "events";
import type {
  DeviceDiagnostic,
  IndustrialLogEntry,
  NormalizedIndustrialReading,
  RawIndustrialPayload
} from "./types";

export interface IndustrialEvents {
  rawPayload: RawIndustrialPayload;
  reading: NormalizedIndustrialReading;
  diagnostic: DeviceDiagnostic;
  log: IndustrialLogEntry;
}

export class IndustrialEventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof IndustrialEvents>(event: K, payload: IndustrialEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof IndustrialEvents>(
    event: K,
    listener: (payload: IndustrialEvents[K]) => void
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}

export function createLog(
  agent: string,
  message: string,
  level: IndustrialLogEntry["level"] = "info",
  payload?: unknown,
  deviceId?: string
): IndustrialLogEntry {
  return {
    timestamp: new Date().toISOString(),
    agent,
    deviceId,
    level,
    message,
    payload
  };
}
