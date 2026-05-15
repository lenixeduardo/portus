import { BrowserWindow } from "electron";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { listEquipments } from "../db/equipments-repo";
import { getCaptureTimeoutSeconds } from "../db/settings-repo";
import {
  cancelCaptureSession,
  completeCaptureSession,
  createCaptureSession,
  insertReading
} from "../db/capture-repo";
import type {
  CaptureEndedEvent,
  CaptureStartResult,
  CaptureTickEvent,
  SlotInitState,
  SlotStatus,
  SlotUpdateEvent
} from "../../shared/ipc";
import { IPC } from "../../shared/ipc";
import type { ServiceResult } from "../../shared/ipc";
import type { Equipment } from "../../shared/types";

interface ActiveSlot {
  equipment: Equipment;
  port: SerialPort;
  status: SlotStatus;
}

let sessionId: number | null = null;
let batchId: number | null = null;
let slots: Map<number, ActiveSlot> = new Map();
let timer: NodeJS.Timeout | null = null;
let remaining = 0;
let total = 0;

function broadcast(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  });
}

function cleanup(reason: "completed" | "cancelled"): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  slots.forEach((slot) => {
    if (slot.port.isOpen) {
      slot.port.close();
    }
  });
  slots.clear();

  if (sessionId !== null) {
    if (reason === "completed") {
      completeCaptureSession(sessionId);
    } else {
      cancelCaptureSession(sessionId);
    }
  }

  sessionId = null;
  batchId = null;
  remaining = 0;
  total = 0;

  const event: CaptureEndedEvent = { reason };
  broadcast(IPC.captureEnded, event);
}

export function isActive(): boolean {
  return sessionId !== null;
}

export async function startCapture(
  targetBatchId: number
): Promise<ServiceResult<CaptureStartResult>> {
  if (isActive()) {
    return { ok: false, error: "Já existe uma captura em andamento." };
  }

  const equipments = listEquipments().filter((e) => e.enabled);
  if (equipments.length === 0) {
    return { ok: false, error: "Nenhum equipamento habilitado configurado." };
  }

  const timeoutSeconds = getCaptureTimeoutSeconds();
  const session = createCaptureSession(targetBatchId, timeoutSeconds);
  sessionId = session.id;
  batchId = targetBatchId;
  remaining = timeoutSeconds;
  total = timeoutSeconds;

  const initSlots: SlotInitState[] = [];

  for (const eq of equipments) {
    let port: SerialPort;
    try {
      port = new SerialPort({
        path: eq.portPath,
        baudRate: eq.baudRate,
        dataBits: eq.dataBits,
        stopBits: eq.stopBits,
        parity: eq.parity,
        autoOpen: false
      });
    } catch {
      initSlots.push({ slotIndex: eq.slotIndex, equipmentId: eq.id, name: eq.name, status: "error" });
      continue;
    }

    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    const slot: ActiveSlot = { equipment: eq, port, status: "open" };
    slots.set(eq.slotIndex, slot);

    parser.on("data", (line: string) => {
      const raw = line.trim();
      if (!raw || sessionId === null || batchId === null) return;

      let parsed: string | null = null;
      if (eq.parseRegex) {
        try {
          const match = raw.match(new RegExp(eq.parseRegex));
          parsed = match ? (match[1] ?? match[0]) : null;
        } catch {
          parsed = null;
        }
      } else {
        parsed = raw;
      }

      insertReading({
        batchId: batchId!,
        equipmentId: eq.id,
        valueRaw: raw,
        valueParsed: parsed,
        captureSessionId: sessionId!
      });

      slot.status = "receiving";

      const event: SlotUpdateEvent = {
        slotIndex: eq.slotIndex,
        status: "receiving",
        valueRaw: raw,
        valueParsed: parsed ?? undefined,
        timestamp: new Date().toISOString()
      };
      broadcast(IPC.captureSlotUpdate, event);
    });

    await new Promise<void>((resolve) => {
      port.open((err) => {
        if (err) {
          slot.status = "error";
          const errEvent: SlotUpdateEvent = {
            slotIndex: eq.slotIndex,
            status: "error"
          };
          broadcast(IPC.captureSlotUpdate, errEvent);
        }
        resolve();
      });
    });

    initSlots.push({
      slotIndex: eq.slotIndex,
      equipmentId: eq.id,
      name: eq.name,
      status: slot.status
    });
  }

  timer = setInterval(() => {
    remaining -= 1;

    const tick: CaptureTickEvent = { remaining, total };
    broadcast(IPC.captureTick, tick);

    if (remaining <= 0) {
      cleanup("completed");
    }
  }, 1000);

  return {
    ok: true,
    data: {
      sessionId: session.id,
      slots: initSlots,
      timeoutSeconds
    }
  };
}

export function cancelCapture(): ServiceResult<true> {
  if (!isActive()) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  cleanup("cancelled");
  return { ok: true, data: true };
}
