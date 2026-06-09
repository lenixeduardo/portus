import { BrowserWindow } from "electron";
import { SerialPort } from "serialport";
import { listEquipments } from "../db/equipments-repo";
import { getCaptureTimeoutSeconds } from "../db/settings-repo";
import { getBatchWithProduct } from "../db/batches-repo";
import {
  cancelCaptureSession,
  completeCaptureSession,
  createCaptureSession,
  insertReading
} from "../db/capture-repo";
import { delimiterChars, parseReading } from "./parse";
import type {
  CaptureEndedEvent,
  CaptureStartResult,
  CaptureStateSnapshot,
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

// Limite de buffer por porta (100KB) para evitar acúmulo excessivo em caso de desconexão
const BUFFER_LIMIT_BYTES = 100 * 1024;

// Tempo máximo de espera pela abertura de cada porta antes de marcá-la como erro
// e seguir com a sessão (evita travar a captura caso o driver não responda).
const OPEN_TIMEOUT_MS = 5000;

interface ActiveSlot {
  equipment: Equipment;
  port: SerialPort;
  status: SlotStatus;
  delimiter: string;
  regex: RegExp | null;
  regexInvalid: boolean;
  // Acumula bytes recebidos até encontrar o delimitador de linha.
  buffer: string;
  // Registra quantas tentativas de abertura foram feitas (para logging)
  openAttempts: number;
  // Registra se este slot usou fallback para porta reserva
  usedFallback: boolean;
  // Registra a porta original que falhou (se usedFallback=true)
  originalPortPath?: string;
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

// Processa uma linha completa: parseia, grava (auditoria de TODAS as leituras)
// e agenda a atualização visual. Cada leitura recebida na janela é persistida.
function handleLine(slot: ActiveSlot, line: string): void {
  const raw = line.trim();
  const sid = sessionId;
  const bid = batchId;
  if (!raw || sid === null || bid === null) return;

  const eq = slot.equipment;
  const { parsed, failureReason } = parseReading(raw, slot.regex, slot.regexInvalid);

  if (failureReason === "no_match") {
    console.warn(
      `[serial] Parsing sem match (slot ${eq.slotIndex}, regex="${eq.parseRegex}", raw="${raw}")`
    );
  } else if (failureReason === "invalid_regex") {
    console.error(`[serial] Regex inválida (slot ${eq.slotIndex}, regex="${eq.parseRegex}")`);
  }

  insertReading({
    batchId: bid,
    equipmentId: eq.id,
    valueRaw: raw,
    valueParsed: parsed,
    captureSessionId: sid,
    parseFailureReason: failureReason,
    parseRegexUsed: eq.parseRegex ?? null
  });

  slot.status = "receiving";

  const event: SlotUpdateEvent = {
    slotIndex: eq.slotIndex,
    status: "receiving",
    valueRaw: raw,
    valueParsed: parsed ?? undefined,
    timestamp: new Date().toISOString()
  };
  scheduleUiBroadcast(eq.slotIndex, event);
}

// Consome o buffer do slot extraindo todas as linhas completas delimitadas.
function drainBuffer(slot: ActiveSlot): void {
  let idx: number;
  while ((idx = slot.buffer.indexOf(slot.delimiter)) >= 0) {
    const line = slot.buffer.slice(0, idx);
    slot.buffer = slot.buffer.slice(idx + slot.delimiter.length);
    handleLine(slot, line);
  }
}

async function cleanup(reason: "completed" | "cancelled"): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  // Flush de linhas parciais ainda no buffer (sem delimitador final) antes de
  // fechar — evita perder a última leitura recebida junto do timeout.
  slots.forEach((slot) => {
    const tail = slot.buffer;
    slot.buffer = "";
    if (tail.trim()) handleLine(slot, tail);
  });

  // Cancela todos os debounces pendentes antes de fechar
  uiDebounceTimers.forEach((t) => clearTimeout(t));
  uiDebounceTimers.clear();

  // Aguarda o fechamento efetivo de todas as portas antes de liberar a sessão,
  // evitando colisão de handle COM ao reabrir numa nova captura (reentrância).
  const closes: Promise<void>[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot.port.isOpen) {
      intentionallyClosing.add(slotIndex);
      closes.push(
        new Promise<void>((resolve) => {
          try {
            slot.port.close(() => resolve());
          } catch {
            resolve();
          }
        })
      );
    }
  });
  await Promise.all(closes);

  slots.clear();
  reconnectAttempted.clear();

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
// Apenas uma tentativa por slot por sessão. Como o listener de dados está
// ligado diretamente à porta, ele permanece válido após a reabertura.
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

export function getState(): CaptureStateSnapshot {
  const slotStates: SlotInitState[] = [];
  slots.forEach((slot) => {
    slotStates.push({
      slotIndex: slot.equipment.slotIndex,
      equipmentId: slot.equipment.id,
      name: slot.equipment.name,
      status: slot.status
    });
  });
  slotStates.sort((a, b) => a.slotIndex - b.slotIndex);
  return { active: isActive(), batchId, sessionId, remaining, total, slots: slotStates };
}

export async function startCapture(
  targetBatchId: number
): Promise<ServiceResult<CaptureStartResult>> {
  if (isActive()) {
    return { ok: false, error: "Já existe uma captura em andamento." };
  }

  if (!Number.isInteger(targetBatchId)) {
    return { ok: false, error: "Lote inválido." };
  }
  const batch = getBatchWithProduct(targetBatchId);
  if (!batch) {
    return { ok: false, error: "Lote não encontrado." };
  }
  if (batch.status !== "open") {
    return { ok: false, error: "O lote já foi finalizado e não aceita novas leituras." };
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

    // Pré-compila a regex uma vez por equipamento (em vez de por linha).
    let regex: RegExp | null = null;
    let regexInvalid = false;
    if (eq.parseRegex) {
      try {
        regex = new RegExp(eq.parseRegex);
      } catch {
        regexInvalid = true;
        console.error(`[serial] Regex inválida ao iniciar (slot ${eq.slotIndex}, regex="${eq.parseRegex}")`);
      }
    }

    const slot: ActiveSlot = {
      equipment: eq,
      port,
      status: "open",
      delimiter: delimiterChars(eq.lineDelimiter),
      regex,
      regexInvalid,
      buffer: "",
      openAttempts: 1,
      usedFallback: false
    };
    slots.set(eq.slotIndex, slot);

    // Buffer próprio: tolera fragmentação/agregação dos chunks e respeita o
    // delimitador configurável por equipamento. O listener fica na porta, então
    // sobrevive a uma reabertura por reconexão.
    port.on("data", (chunk: Buffer) => {
      if (sessionId === null) return;
      slot.buffer += chunk.toString("utf8");
      drainBuffer(slot);
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
      const s = slots.get(eq.slotIndex);
      if (s && s.status !== "error") {
        s.status = "error";
        broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
      }
    });

    const initSlotEntry: SlotInitState = {
      slotIndex: eq.slotIndex,
      equipmentId: eq.id,
      name: eq.name,
      status: "open"
    };
    initSlots.push(initSlotEntry);

    const openPromise = new Promise<void>((resolve) => {
      // Garante que a abertura nunca bloqueie indefinidamente a sessão: se o
      // driver da porta travar e o callback não retornar, o slot é marcado como
      // erro e a captura segue (o timer de countdown não fica preso em "abrindo").
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(openTimeout);
        resolve();
      };
      const openTimeout = setTimeout(() => {
        console.error(`[serial] Timeout ao abrir porta (slot ${eq.slotIndex}, ${eq.portPath})`);
        slot.status = "error";
        initSlotEntry.status = "error";
        broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
        finish();
      }, OPEN_TIMEOUT_MS);

      port.open((err) => {
        if (err) {
          console.error(`[serial] Falha ao abrir porta (slot ${eq.slotIndex}, ${eq.portPath}):`, err.message);
          slot.status = "error";
          initSlotEntry.status = "error";
          broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
        }
        finish();
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
      void cleanup("completed");
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

export async function cancelCapture(): Promise<ServiceResult<true>> {
  if (!isActive()) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  await cleanup("cancelled");
  return { ok: true, data: true };
}
