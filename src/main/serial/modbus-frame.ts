import type { ModbusFunction, ModbusRegisterDecode } from "../../shared/types";

// Funções puras de protocolo Modbus RTU (sem I/O). Adaptadas de
// src/main/industrial/modbus-communication-agent.ts para reuso pelo poller serial,
// sem arrastar a dependência do event-bus dos agentes industriais.

export function crc16Modbus(frame: Buffer): number {
  let crc = 0xffff;
  for (const byte of frame) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      const carry = crc & 0x0001;
      crc >>= 1;
      if (carry) crc ^= 0xa001;
    }
  }
  return crc & 0xffff;
}

export function appendCrc(frame: Buffer): Buffer {
  const crc = crc16Modbus(frame);
  // CRC é transmitido little-endian (low byte primeiro).
  return Buffer.concat([frame, Buffer.from([crc & 0xff, (crc >> 8) & 0xff])]);
}

export function isValidCrc(frame: Buffer): boolean {
  if (frame.length < 4) return false;
  const body = frame.subarray(0, frame.length - 2);
  const expected = crc16Modbus(body);
  const received = frame.readUInt16LE(frame.length - 2);
  return expected === received;
}

// Monta a requisição de leitura de registradores (função 0x03 Holding ou 0x04 Input).
// Ex.: unitId=0x10, fn=3, start=0, qty=2 → "10 03 00 00 00 02 <CRC>".
export function buildReadRegistersFrame(
  unitId: number,
  fn: ModbusFunction,
  startAddress: number,
  quantity: number
): Buffer {
  const body = Buffer.alloc(6);
  body.writeUInt8(unitId, 0);
  body.writeUInt8(fn, 1);
  body.writeUInt16BE(startAddress, 2);
  body.writeUInt16BE(quantity, 4);
  return appendCrc(body);
}

// Tamanho esperado de uma resposta normal de leitura de registradores:
// addr(1) + fn(1) + byteCount(1) + dados(quantity*2) + CRC(2).
export function expectedReadResponseLength(quantity: number): number {
  return 5 + quantity * 2;
}

// Tamanho de uma resposta de exceção: addr(1) + (fn|0x80)(1) + errCode(1) + CRC(2).
export const EXCEPTION_RESPONSE_LENGTH = 5;

export interface ModbusResponse {
  registers: number[];
}

export class ModbusException extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "ModbusException";
  }
}

// Faz parsing de uma resposta de leitura de registradores já completa.
// Lança ModbusException para respostas de erro do escravo e Error para frames inválidos.
export function parseReadRegistersResponse(frame: Buffer, fn: ModbusFunction): ModbusResponse {
  if (!isValidCrc(frame)) {
    throw new Error("CRC Modbus inválido.");
  }
  const functionCode = frame.readUInt8(1);
  if (functionCode === (fn | 0x80)) {
    const exceptionCode = frame.readUInt8(2);
    throw new ModbusException(exceptionCode, `Exceção Modbus do escravo: código ${exceptionCode}.`);
  }
  if (functionCode !== fn) {
    throw new Error(`Function code inesperado: ${functionCode} (esperado ${fn}).`);
  }
  const byteCount = frame.readUInt8(2);
  if (byteCount % 2 !== 0 || frame.length < 3 + byteCount + 2) {
    throw new Error("Payload Modbus incompleto.");
  }
  const registers: number[] = [];
  for (let offset = 3; offset < 3 + byteCount; offset += 2) {
    registers.push(frame.readUInt16BE(offset));
  }
  return { registers };
}

// Converte os registradores de 16 bits em um número conforme a decodificação configurada.
export function decodeRegisters(registers: number[], decode: ModbusRegisterDecode): number | null {
  if (registers.length === 0) return null;
  const r0 = registers[0];
  switch (decode) {
    case "uint16":
      return r0;
    case "int16":
      return r0 > 0x7fff ? r0 - 0x10000 : r0;
    case "uint32_be":
      if (registers.length < 2) return r0;
      return r0 * 0x10000 + registers[1];
    case "uint32_le":
      if (registers.length < 2) return r0;
      return registers[1] * 0x10000 + r0;
    default:
      return r0;
  }
}
