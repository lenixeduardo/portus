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

// Janela de debounce para atualizações visuais por slot (ms).
// Todas as leituras são gravadas no banco imediatamente; apenas a última
// dentro da janela é enviada à UI para evitar flickering.
const UI_DEBOUNCE_MS = 500;

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

// Timers de debounce de UI por slotIndex
const uiDebounceTimers: Map<number, NodeJS.Timeout> = new Map();

// Slots cuja reconexão já foi tentada nesta sessão (evita loop infinito)
const reconnectAttempted: Set<number> = new Set();

// Slots sendo fechados intencionalmente (cleanup) — suprime trigger de reconexão
const intentionallyClosing: Set<number> = new Set();

// Slots que já registraram uma leitura nesta sessão — aceita só a primeira por slot
const slotsWithReading: Set<number> = new Set();

function broadcast(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  });
}

function clearUiDebounce(slotIndex: number): void {
  const t = uiDebounceTimers.get(slotIndex);
  if (t) {
    clearTimeout(t);
    uiDebounceTimers.delete(slotIndex);
  }
}

function scheduleUiBroadcast(slotIndex: number, event: SlotUpdateEvent): void {
  clearUiDebounce(slotIndex);
  uiDebounceTimers.set(
    slotIndex,
    setTimeout(() => {
      uiDebounceTimers.delete(slotIndex);
      // Não envia se a sessão já encerrou enquanto aguardava o debounce
      if (sessionId !== null) {
        broadcast(IPC.captureSlotUpdate, event);
      }
    }, UI_DEBOUNCE_MS)
  );
}

function cleanup(reason: "completed" | "cancelled"): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  // Cancela todos os debounces pendentes antes de fechar
  uiDebounceTimers.forEach((t) => clearTimeout(t));
  uiDebounceTimers.clear();

  slots.forEach((slot, slotIndex) => {
    if (slot.port.isOpen) {
      intentionallyClosing.add(slotIndex);
      slot.port.close();
    }
  });
  slots.clear();
  reconnectAttempted.clear();
  slotsWithReading.clear();

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

// Tenta reabrir uma porta que fechou inesperadamente durante a sessão.
// Apenas uma tentativa por slot por sessão.
function attemptReconnect(slotIndex: number): void {
  if (sessionId === null) return;
  if (reconnectAttempted.has(slotIndex)) return;
  reconnectAttempted.add(slotIndex);

  const slot = slots.get(slotIndex);
  if (!slot) return;

  console.log(`[serial] Porta ${slot.equipment.portPath} (slot ${slotIndex}) fechou inesperadamente. Tentando reconexão...`);

  slot.port.open((err) => {
    if (err) {
      console.error(`[serial] Reconexão falhou (slot ${slotIndex}, porta ${slot.equipment.portPath}):`, err.message);
      slot.status = "error";
      broadcast(IPC.captureSlotUpdate, { slotIndex, status: "error" } satisfies SlotUpdateEvent);
    } else {
      console.log(`[serial] Reconexão bem-sucedida (slot ${slotIndex}, porta ${slot.equipment.portPath})`);
      slot.status = "open";
      broadcast(IPC.captureSlotUpdate, { slotIndex, status: "open" } satisfies SlotUpdateEvent);
    }
  });
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
  const openPromises: Promise<void>[] = [];

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
    } catch (err) {
      console.error(`[serial] Falha ao criar porta para slot ${eq.slotIndex} (${eq.portPath}):`, (err as Error).message);
      initSlots.push({ slotIndex: eq.slotIndex, equipmentId: eq.id, name: eq.name, status: "error" });
      continue;
    }

    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
    const slot: ActiveSlot = { equipment: eq, port, status: "open" };
    slots.set(eq.slotIndex, slot);

    // --- Processamento de dados recebidos ---
    parser.on("data", (line: string) => {
      const raw = line.trim();
      if (!raw || sessionId === null || batchId === null) return;

      let parsed: string | null = null;
      let parseFailureReason: string | null = null;
      const parseRegexUsed: string | null = eq.parseRegex ?? null;

      if (eq.parseRegex) {
        try {
          const match = raw.match(new RegExp(eq.parseRegex));
          if (match) {
            parsed = match[1] ?? match[0];
          } else {
            parseFailureReason = "no_match";
            console.warn(
              `[serial] Parsing sem match (slot ${eq.slotIndex}, regex="${eq.parseRegex}", raw="${raw}")`
            );
          }
        } catch (regexErr) {
          parseFailureReason = "invalid_regex";
          console.error(
            `[serial] Regex inválida (slot ${eq.slotIndex}, regex="${eq.parseRegex}"):`,
            (regexErr as Error).message
          );
        }
      } else {
        parsed = raw;
      }

      insertReading({
        batchId: batchId!,
        equipmentId: eq.id,
        valueRaw: raw,
        valueParsed: parsed,
        captureSessionId: sessionId!,
        parseFailureReason,
        parseRegexUsed
      });
      slotsWithReading.add(eq.slotIndex);

      slot.status = "receiving";

      // Atualização visual via debounce — só a última leitura dentro de
      // UI_DEBOUNCE_MS chega à UI, evitando re-renders excessivos
      const event: SlotUpdateEvent = {
        slotIndex: eq.slotIndex,
        status: "receiving",
        valueRaw: raw,
        valueParsed: parsed ?? undefined,
        timestamp: new Date().toISOString()
      };
      scheduleUiBroadcast(eq.slotIndex, event);
    });

    // --- Reconexão automática em caso de fechamento inesperado ---
    port.on("close", () => {
      if (intentionallyClosing.has(eq.slotIndex)) {
        // Fechamento intencional pelo cleanup — não reconectar
        intentionallyClosing.delete(eq.slotIndex);
        return;
      }
      clearUiDebounce(eq.slotIndex);
      attemptReconnect(eq.slotIndex);
    });

    port.on("error", (err) => {
      console.error(`[serial] Erro na porta (slot ${eq.slotIndex}, ${eq.portPath}):`, err.message);
    });

    const initSlotEntry: SlotInitState = {
      slotIndex: eq.slotIndex,
      equipmentId: eq.id,
      name: eq.name,
      status: "open"
    };
    initSlots.push(initSlotEntry);

    const openPromise = new Promise<void>((resolve) => {
      port.open((err) => {
        if (err) {
          console.error(`[serial] Falha ao abrir porta (slot ${eq.slotIndex}, ${eq.portPath}):`, err.message);
          slot.status = "error";
          initSlotEntry.status = "error";
          broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
        }
        resolve();
      });
    });
    openPromises.push(openPromise);
  }

  await Promise.all(openPromises);

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
