import { BrowserWindow } from "electron";
import { SerialPort } from "serialport";
import { listEquipments, updateEquipment } from "../db/equipments-repo";
import { getCaptureTimeoutSeconds } from "../db/settings-repo";
import { getBatchWithProduct } from "../db/batches-repo";
import { insertCaptureErrorLog } from "../db/capture-error-logs-repo";
import {
  cancelCaptureSession,
  completeCaptureSession,
  createCaptureSession,
  insertReading
} from "../db/capture-repo";
import { delimiterChars, parseReading } from "./parse";
import { startModbusPolling } from "./modbus-poller";
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
  // Conta linhas completas recebidas nesta sessão (para skipFirstReading)
  linesReceived: number;
  // Para slots Modbus: função que interrompe o polling ativo.
  modbusStop?: () => void;
}

// Conecta um slot Modbus aos mesmos mecanismos de persistência/UI/log usados pelo
// modo passivo: cada resposta vira uma leitura em `readings`; erros vão para o log de
// captura e acendem o LED vermelho do slot sem interromper o polling.
function startModbusForSlot(slot: ActiveSlot): void {
  const eq = slot.equipment;
  slot.modbusStop = startModbusPolling(slot.port, eq, {
    onReading: ({ valueRaw, valueParsed }) => {
      const sid = sessionId;
      const bid = batchId;
      if (sid === null || bid === null) return;

      slot.linesReceived++;
      if ((eq.skipFirstReading || skipFirstReadingForSession) && slot.linesReceived === 1) {
        return;
      }

      insertReading({
        batchId: bid,
        equipmentId: eq.id,
        valueRaw,
        valueParsed,
        captureSessionId: sid,
        parseFailureReason: null,
        parseRegexUsed: null
      });

      slot.status = "receiving";

      if (eq.stopAfterFirstReading) {
        closeSlotAfterFirstReading(eq.slotIndex);
        return;
      }

      scheduleUiBroadcast(eq.slotIndex, {
        slotIndex: eq.slotIndex,
        status: "receiving",
        valueRaw,
        valueParsed: valueParsed ?? undefined,
        timestamp: new Date().toISOString()
      });
    },
    onError: (code, message) => {
      logCaptureError({ slot, severity: "warn", code, message });
      console.warn(`[modbus] ${message}`);
    },
    onStatus: (status) => {
      if (status !== "error") return;
      const s = slots.get(eq.slotIndex);
      if (s && s.status !== "error") {
        s.status = "error";
        broadcast(IPC.captureSlotUpdate, {
          slotIndex: eq.slotIndex,
          status: "error"
        } satisfies SlotUpdateEvent);
      }
    }
  });
}

let sessionId: number | null = null;
let batchId: number | null = null;
let slots: Map<number, ActiveSlot> = new Map();
let timer: NodeJS.Timeout | null = null;
let remaining = 0;
let total = 0;
let skipFirstReadingForSession = false;

// Timers de debounce de UI por slotIndex
const uiDebounceTimers: Map<number, NodeJS.Timeout> = new Map();

// Slots cuja reconexão já foi tentada nesta sessão (evita loop infinito)
const reconnectAttempted: Set<number> = new Set();

// Slots sendo fechados intencionalmente (cleanup) — suprime trigger de reconexão
const intentionallyClosing: Set<number> = new Set();

function logCaptureError(input: {
  slot?: ActiveSlot;
  slotIndex?: number;
  severity?: "warn" | "error";
  code: string;
  message: string;
  rawValue?: string | null;
  context?: Record<string, unknown>;
}): void {
  try {
    insertCaptureErrorLog({
      batchId,
      captureSessionId: sessionId,
      equipmentId: input.slot?.equipment.id ?? null,
      slotIndex: input.slot?.equipment.slotIndex ?? input.slotIndex ?? null,
      severity: input.severity ?? "error",
      code: input.code,
      message: input.message,
      rawValue: input.rawValue ?? null,
      context: input.context
    });
  } catch (err) {
    console.error("[serial] Falha ao gravar log de erro da captura:", err);
  }
}

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

  slot.linesReceived++;

  const eq = slot.equipment;

  if ((eq.skipFirstReading || skipFirstReadingForSession) && slot.linesReceived === 1) {
    console.log(`[serial] Primeira linha ignorada (slot ${eq.slotIndex}, skipFirstReading) raw="${raw}"`);
    return;
  }
  const { parsed, failureReason } = parseReading(raw, slot.regex, slot.regexInvalid);

  if (failureReason) {
    logCaptureError({
      slot,
      severity: failureReason === "no_match" ? "warn" : "error",
      code: failureReason,
      message:
        failureReason === "no_match"
          ? `Parsing sem match (slot ${eq.slotIndex}, regex="${eq.parseRegex}", raw="${raw}")`
          : `Regex inválida (slot ${eq.slotIndex}, regex="${eq.parseRegex}")`,
      rawValue: raw,
      context: { regex: eq.parseRegex }
    });
  }

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

  if (eq.stopAfterFirstReading) {
    closeSlotAfterFirstReading(eq.slotIndex);
    return;
  }

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

  // Interrompe pollers Modbus antes de qualquer flush/fechamento de porta.
  slots.forEach((slot) => {
    if (slot.modbusStop) {
      slot.modbusStop();
      slot.modbusStop = undefined;
    }
  });

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
  skipFirstReadingForSession = false;

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
      logCaptureError({
        slot,
        code: "serial_reconnect_failed",
        message: `Reconexão falhou (slot ${slotIndex}, porta ${slot.equipment.portPath}): ${err.message}`,
        context: { portPath: slot.equipment.portPath }
      });
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

function closeSlotAfterFirstReading(slotIndex: number): void {
  const slot = slots.get(slotIndex);
  if (!slot || slot.status === "completed") return;

  if (slot.modbusStop) {
    slot.modbusStop();
    slot.modbusStop = undefined;
  }

  intentionallyClosing.add(slotIndex);

  const pending = uiDebounceTimers.get(slotIndex);
  if (pending) {
    clearTimeout(pending);
    uiDebounceTimers.delete(slotIndex);
  }

  slot.status = "completed";
  broadcast(IPC.captureSlotUpdate, { slotIndex, status: "completed" } satisfies SlotUpdateEvent);

  if (slot.port.isOpen) {
    slot.port.close((err) => {
      if (err) {
        console.warn(`[serial] Erro ao fechar slot ${slotIndex} após 1ª leitura:`, err.message);
      }
    });
  }
  console.log(`[serial] Slot ${slotIndex} encerrado após primeira leitura (stopAfterFirstReading).`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openPortWithRetry(
  port: SerialPort,
  slot: ActiveSlot,
  openTimeoutMs: number
): Promise<boolean> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    slot.openAttempts = attempt + 1;
    const success = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        logCaptureError({
          slot,
          code: "serial_open_timeout",
          message: `Timeout ao abrir porta (slot ${slot.equipment.slotIndex}, ${port.path}, tentativa ${attempt + 1})`,
          context: { portPath: port.path, attempt: attempt + 1, openTimeoutMs }
        });
        console.error(`[serial] Timeout ao abrir porta (slot ${slot.equipment.slotIndex}, ${port.path}, tentativa ${attempt + 1})`);
        finish(false);
      }, openTimeoutMs);

      port.open((err) => {
        if (err) {
          logCaptureError({
            slot,
            code: "serial_open_failed",
            message: `Falha ao abrir porta (slot ${slot.equipment.slotIndex}, ${port.path}, tentativa ${attempt + 1}): ${err.message}`,
            context: { portPath: port.path, attempt: attempt + 1 }
          });
          console.error(`[serial] Falha ao abrir porta (slot ${slot.equipment.slotIndex}, ${port.path}, tentativa ${attempt + 1}):`, err.message);
          finish(false);
        } else {
          finish(true);
        }
      });
    });

    if (success) {
      return true;
    }

    if (attempt < maxRetries - 1) {
      await sleep(100 * Math.pow(2, attempt)); // exponential backoff
    }
  }
  return false;
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
  return { active: isActive(), batchId, sessionId, remaining, total, skipFirstReading: skipFirstReadingForSession, slots: slotStates };
}

export async function startCapture(
  targetBatchId: number,
  equipmentIds?: number[]
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

  const equipments = listEquipments().filter(
    (e) => e.enabled && (equipmentIds == null || equipmentIds.includes(e.id))
  );
  if (equipments.length === 0) {
    return { ok: false, error: "Nenhum equipamento habilitado configurado." };
  }

  const timeoutSeconds = getCaptureTimeoutSeconds();
  const session = createCaptureSession(targetBatchId, timeoutSeconds);
  sessionId = session.id;
  batchId = targetBatchId;
  remaining = timeoutSeconds;
  total = timeoutSeconds;
  skipFirstReadingForSession = false;

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
      logCaptureError({
        slotIndex: eq.slotIndex,
        code: "serial_port_create_failed",
        message: `Falha ao criar porta para slot ${eq.slotIndex} (${eq.portPath}): ${(err as Error).message}`,
        context: { equipmentId: eq.id, portPath: eq.portPath }
      });
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
        logCaptureError({
          slotIndex: eq.slotIndex,
          code: "invalid_parse_regex_on_start",
          message: `Regex inválida ao iniciar (slot ${eq.slotIndex}, regex="${eq.parseRegex}")`,
          context: { equipmentId: eq.id, regex: eq.parseRegex }
        });
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
      usedFallback: false,
      linesReceived: 0
    };
    slots.set(eq.slotIndex, slot);

    const isModbus = eq.protocol === "modbus_rtu";

    // Modo passivo: buffer próprio que tolera fragmentação/agregação dos chunks e
    // respeita o delimitador configurável por equipamento. O listener fica na porta,
    // então sobrevive a uma reabertura por reconexão.
    // Modo Modbus: o poller anexa seu próprio listener de dados ao iniciar, portanto
    // não registramos o listener passivo aqui.
    if (!isModbus) {
      port.on("data", (chunk: Buffer) => {
        if (sessionId === null) return;
        // latin1 mapeia cada byte 0-255 sem substituição — preserva exatamente o
        // que o equipamento enviou, incluindo caracteres >127 (ex.: grau, unidades).
        slot.buffer += chunk.toString("latin1");
        drainBuffer(slot);
      });
    }

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
      logCaptureError({
        slot,
        code: "serial_port_error",
        message: `Erro na porta (slot ${eq.slotIndex}, ${eq.portPath}): ${err.message}`,
        context: { portPath: eq.portPath }
      });
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

    const openPromise = (async () => {
      let opened = await openPortWithRetry(port, slot, OPEN_TIMEOUT_MS);

      // Se falhar e for um slot de 1-5, tenta usar fallback (slot 6 "Reserva")
      if (!opened && eq.slotIndex >= 1 && eq.slotIndex <= 5) {
        const allEquipments = listEquipments();
        const reserveEq = allEquipments.find((e) => e.slotIndex === 6 || e.name === "Reserva");
        if (reserveEq && reserveEq.portPath && reserveEq.portPath !== eq.portPath) {
          console.log(`[serial] Acionando fallback para porta reserva (slot ${eq.slotIndex}, porta ${reserveEq.portPath})`);
          slot.usedFallback = true;
          slot.originalPortPath = eq.portPath;

          try {
            port = new SerialPort({
              path: reserveEq.portPath,
              baudRate: eq.baudRate,
              dataBits: eq.dataBits,
              stopBits: eq.stopBits,
              parity: eq.parity,
              autoOpen: false
            });
            slot.port = port;

            // Re-bind listeners para a nova porta de fallback (listener de dados
            // apenas no modo passivo; no Modbus o poller cuida disso ao iniciar).
            if (!isModbus) {
              port.on("data", (chunk: Buffer) => {
                if (sessionId === null) return;
                slot.buffer += chunk.toString("latin1");
                drainBuffer(slot);
              });
            }

            port.on("close", () => {
              if (intentionallyClosing.has(eq.slotIndex)) {
                intentionallyClosing.delete(eq.slotIndex);
                return;
              }
              clearUiDebounce(eq.slotIndex);
              attemptReconnect(eq.slotIndex);
            });

            port.on("error", (err) => {
              logCaptureError({
                slot,
                code: "serial_fallback_port_error",
                message: `Erro na porta de fallback (slot ${eq.slotIndex}, ${reserveEq.portPath}): ${err.message}`,
                context: { originalPortPath: eq.portPath, fallbackPortPath: reserveEq.portPath }
              });
              console.error(`[serial] Erro na porta de fallback (slot ${eq.slotIndex}, ${reserveEq.portPath}):`, err.message);
              const s = slots.get(eq.slotIndex);
              if (s && s.status !== "error") {
                s.status = "error";
                broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
              }
            });

            opened = await openPortWithRetry(port, slot, OPEN_TIMEOUT_MS);
          } catch (fallbackErr) {
            logCaptureError({
              slot,
              code: "serial_fallback_create_failed",
              message: `Falha ao criar porta de fallback para slot ${eq.slotIndex}: ${(fallbackErr as Error).message}`,
              context: { originalPortPath: eq.portPath, fallbackPortPath: reserveEq.portPath }
            });
            console.error(`[serial] Falha ao criar porta de fallback para slot ${eq.slotIndex}:`, (fallbackErr as Error).message);
          }
        }
      }

      if (opened) {
        slot.status = "open";
        initSlotEntry.status = "open";
        // Inicia o polling Modbus na porta efetivamente aberta (original ou fallback).
        if (isModbus) {
          startModbusForSlot(slot);
        }
      } else {
        // Se falhar tudo, desabilita o equipamento no banco automaticamente
        logCaptureError({
          slot,
          code: "equipment_disabled_after_open_failures",
          message: `Desabilitando equipamento permanentemente por falhas consecutivas de abertura (slot ${eq.slotIndex}, id ${eq.id})`,
          context: { portPath: eq.portPath, usedFallback: slot.usedFallback, originalPortPath: slot.originalPortPath }
        });
        console.error(`[serial] Desabilitando equipamento permanentemente por falhas consecutivas de abertura (slot ${eq.slotIndex}, id ${eq.id})`);
        try {
          updateEquipment(eq.id, { enabled: false });
        } catch (dbErr) {
          logCaptureError({
            slot,
            code: "equipment_disable_failed",
            message: `Erro ao desabilitar equipamento no banco: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
            context: { equipmentId: eq.id }
          });
          console.error(`[serial] Erro ao desabilitar equipamento no banco:`, dbErr);
        }
        slot.status = "error";
        initSlotEntry.status = "error";
        broadcast(IPC.captureSlotUpdate, { slotIndex: eq.slotIndex, status: "error" } satisfies SlotUpdateEvent);
      }
    })();
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

export function injectManualReading(slotIndex: number, rawValue: string): ServiceResult<true> {
  if (!isActive()) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  const slot = slots.get(slotIndex);
  if (!slot) {
    return { ok: false, error: `Slot ${slotIndex} não encontrado na sessão atual.` };
  }
  if (slot.status === "completed") {
    return { ok: false, error: `Slot ${slotIndex} já encerrou a leitura.` };
  }
  handleLine(slot, rawValue);
  return { ok: true, data: true };
}

export function skipFirstReading(): ServiceResult<true> {
  if (!isActive()) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  skipFirstReadingForSession = true;
  console.log("[serial] Primeira leitura da sessão será ignorada para todos os equipamentos.");
  return { ok: true, data: true };
}

export async function cancelCapture(): Promise<ServiceResult<true>> {
  if (!isActive()) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  await cleanup("cancelled");
  return { ok: true, data: true };
}
