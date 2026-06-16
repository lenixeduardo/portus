import type { SerialPort } from "serialport";
import type { Equipment } from "../../shared/types";
import {
  buildReadRegistersFrame,
  decodeRegisters,
  EXCEPTION_RESPONSE_LENGTH,
  expectedReadResponseLength,
  ModbusException,
  parseReadRegistersResponse
} from "./modbus-frame";
import { applyLinearScale } from "./parse";

export interface ModbusReading {
  // Frame de resposta completo em hex (auditoria do "cru").
  valueRaw: string;
  // Valor final (decodificado e, se habilitado, linearizado) já como string.
  valueParsed: string | null;
}

export interface ModbusPollerCallbacks {
  onReading: (reading: ModbusReading) => void;
  onError: (code: string, message: string) => void;
  onStatus: (status: "receiving" | "error") => void;
}

function toHexSpaced(frame: Buffer): string {
  return frame
    .toString("hex")
    .toUpperCase()
    .replace(/(.{2})/g, "$1 ")
    .trim();
}

// Remove ruído de ponto flutuante do valor escalado mantendo precisão suficiente.
function formatNumber(value: number): string {
  return String(Number(value.toFixed(6)));
}

// Inicia o polling Modbus ativo numa porta já aberta. Envia a requisição de leitura
// repetidamente no intervalo configurado, acumula a resposta até o tamanho determinístico
// esperado (nó único) ou estoura o timeout, decodifica e aplica a linearização.
// Retorna uma função para parar o polling e desanexar o listener.
export function startModbusPolling(
  port: SerialPort,
  equipment: Equipment,
  cb: ModbusPollerCallbacks
): () => void {
  const fn = equipment.modbusFunction;
  const qty = equipment.modbusQuantity;
  const expectedLen = expectedReadResponseLength(qty);
  const requestFrame = buildReadRegistersFrame(
    equipment.modbusUnitId,
    fn,
    equipment.modbusStartAddress,
    qty
  );

  let stopped = false;
  let awaiting = false;
  let buffer = Buffer.alloc(0);
  let timeoutHandle: NodeJS.Timeout | null = null;
  let nextHandle: NodeJS.Timeout | null = null;

  function clearTimeoutHandle(): void {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  // Tamanho necessário para considerar a resposta completa. Respostas de exceção
  // (function code com bit 0x80) têm tamanho fixo menor.
  function neededLength(): number {
    if (buffer.length >= 2 && buffer[1] === (fn | 0x80)) return EXCEPTION_RESPONSE_LENGTH;
    return expectedLen;
  }

  function scheduleNext(): void {
    if (stopped) return;
    nextHandle = setTimeout(pollOnce, equipment.modbusPollIntervalMs);
  }

  function finishTransaction(): void {
    awaiting = false;
    clearTimeoutHandle();
    const frame = buffer;
    buffer = Buffer.alloc(0);

    try {
      const { registers } = parseReadRegistersResponse(frame, fn);
      const decoded = decodeRegisters(registers, equipment.modbusRegisterDecode);
      let finalValue = decoded;

      if (
        equipment.scaleEnabled &&
        decoded !== null &&
        equipment.scaleRawMin !== undefined &&
        equipment.scaleRawMax !== undefined &&
        equipment.scaleOutMin !== undefined &&
        equipment.scaleOutMax !== undefined
      ) {
        const scaled = applyLinearScale(decoded, {
          rawMin: equipment.scaleRawMin,
          rawMax: equipment.scaleRawMax,
          outMin: equipment.scaleOutMin,
          outMax: equipment.scaleOutMax
        });
        if (scaled === null) {
          cb.onError(
            "modbus_scale_invalid",
            `Faixa de linearização inválida (rawMin === rawMax) no slot ${equipment.slotIndex}.`
          );
        } else {
          finalValue = scaled;
        }
      }

      cb.onStatus("receiving");
      cb.onReading({
        valueRaw: toHexSpaced(frame),
        valueParsed: finalValue === null ? null : formatNumber(finalValue)
      });
    } catch (err) {
      if (err instanceof ModbusException) {
        cb.onError("modbus_exception", `${err.message} (slot ${equipment.slotIndex}).`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const code = message.includes("CRC") ? "modbus_crc_error" : "modbus_parse_error";
        cb.onError(code, `${message} (frame=${toHexSpaced(frame)}, slot ${equipment.slotIndex}).`);
      }
      cb.onStatus("error");
    }

    scheduleNext();
  }

  function onData(chunk: Buffer): void {
    if (!awaiting) return; // ignora bytes avulsos entre polls
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length >= neededLength()) {
      finishTransaction();
    }
  }

  function pollOnce(): void {
    if (stopped) return;
    if (!port.isOpen) {
      scheduleNext();
      return;
    }

    buffer = Buffer.alloc(0);
    awaiting = true;

    port.write(requestFrame, (err) => {
      if (err) {
        awaiting = false;
        clearTimeoutHandle();
        cb.onError("modbus_write_error", `Falha ao enviar requisição Modbus: ${err.message}`);
        cb.onStatus("error");
        scheduleNext();
      }
    });

    timeoutHandle = setTimeout(() => {
      if (!awaiting) return;
      awaiting = false;
      timeoutHandle = null;
      cb.onError(
        "modbus_timeout",
        `Sem resposta do nó ${equipment.modbusUnitId} em ${equipment.modbusResponseTimeoutMs}ms (slot ${equipment.slotIndex}).`
      );
      cb.onStatus("error");
      scheduleNext();
    }, equipment.modbusResponseTimeoutMs);
  }

  port.on("data", onData);
  pollOnce();

  return function stop(): void {
    stopped = true;
    awaiting = false;
    clearTimeoutHandle();
    if (nextHandle) {
      clearTimeout(nextHandle);
      nextHandle = null;
    }
    port.removeListener("data", onData);
  };
}
