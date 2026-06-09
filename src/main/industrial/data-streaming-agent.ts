import { createLog, IndustrialEventBus } from "./event-bus";
import type { NormalizedIndustrialReading, StreamTarget } from "./types";

export interface ReadingSink {
  send(reading: NormalizedIndustrialReading): Promise<void>;
}

export class DataStreamingAgent {
  private readonly offlineQueue: NormalizedIndustrialReading[] = [];

  constructor(
    private readonly bus: IndustrialEventBus,
    private readonly sinks: Map<string, ReadingSink>,
    private readonly targets: StreamTarget[]
  ) {}

  async publish(reading: NormalizedIndustrialReading): Promise<void> {
    const enabledTargets = this.targets.filter((target) => target.enabled);
    for (const target of enabledTargets) {
      const sink = this.sinks.get(target.id);
      if (!sink) continue;
      try {
        await sink.send(reading);
      } catch (err) {
        this.offlineQueue.push(reading);
        this.bus.emit(
          "log",
          createLog("streaming", "Falha ao publicar; leitura mantida em cache offline.", "warn", {
            target,
            error: err instanceof Error ? err.message : String(err)
          })
        );
      }
    }
  }

  async flush(): Promise<number> {
    const pending = this.offlineQueue.splice(0);
    for (const reading of pending) {
      await this.publish(reading);
    }
    return pending.length;
  }

  queuedCount(): number {
    return this.offlineQueue.length;
  }
}

export class MemoryReadingSink implements ReadingSink {
  readonly readings: NormalizedIndustrialReading[] = [];

  async send(reading: NormalizedIndustrialReading): Promise<void> {
    this.readings.push(reading);
  }
}
