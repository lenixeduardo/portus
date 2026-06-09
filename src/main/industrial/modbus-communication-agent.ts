import { createLog, IndustrialEventBus } from "./event-bus";
import type { IndustrialDeviceConfig, RawIndustrialPayload } from "./types";

export interface ModbusTransport {
  request(frame: Buffer, timeoutMs: number): Promise<Buffer>;
}

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
  return Buffer.concat([frame, Buffer.from([crc & 0xff, (crc >> 8) & 0xff])]);
}

export function isValidCrc(frame: Buffer): boolean {
  if (frame.length < 4) return false;
  const body = frame.subarray(0, frame.length - 2);
  const expected = crc16Modbus(body);
  const received = frame.readUInt16LE(frame.length - 2);
  return expected === received;
}

export function buildReadHoldingRegistersFrame(
  unitId: number,
  startAddress: number,
  quantity: number
): Buffer {
  const body = Buffer.alloc(6);
  body.writeUInt8(unitId, 0);
  body.writeUInt8(0x03, 1);
  body.writeUInt16BE(startAddress, 2);
  body.writeUInt16BE(quantity, 4);
  return appendCrc(body);
}

export function parseReadHoldingRegistersResponse(frame: Buffer): number[] {
  if (!isValidCrc(frame)) {
    throw new Error("CRC Modbus invalido.");
  }
  const functionCode = frame.readUInt8(1);
  if (functionCode !== 0x03) {
    throw new Error(`Function code inesperado: ${functionCode}.`);
  }
  const byteCount = frame.readUInt8(2);
  if (byteCount % 2 !== 0 || frame.length < 3 + byteCount + 2) {
    throw new Error("Payload Modbus incompleto.");
  }
  const registers: number[] = [];
  for (let offset = 3; offset < 3 + byteCount; offset += 2) {
    registers.push(frame.readUInt16BE(offset));
  }
  return registers;
}

export class ModbusCommunicationAgent {
  constructor(
    private readonly bus: IndustrialEventBus,
    private readonly transportByDevice: Map<string, ModbusTransport>
  ) {}

  async readDevice(device: IndustrialDeviceConfig): Promise<RawIndustrialPayload> {
    const transport = this.transportByDevice.get(device.id);
    if (!transport) {
      throw new Error(`Transporte Modbus nao configurado para ${device.id}.`);
    }

    const request = buildReadHoldingRegistersFrame(
      device.unitId,
      device.registers.startAddress,
      device.registers.quantity
    );

    const started = Date.now();
    const response = await transport.request(request, device.serial.timeoutMs);
    const registers = parseReadHoldingRegistersResponse(response);
    const payload: RawIndustrialPayload = {
      deviceId: device.id,
      deviceType: device.type,
      timestamp: new Date().toISOString(),
      registers,
      rawFrame: response.toString("hex")
    };

    this.bus.emit("rawPayload", payload);
    this.bus.emit(
      "log",
      createLog(
        "modbus",
        `Leitura Modbus concluida em ${Date.now() - started}ms.`,
        "info",
        { registers },
        device.id
      )
    );
    return payload;
  }
}

export class MockModbusTransport implements ModbusTransport {
  constructor(private readonly responseRegisters: number[]) {}

  async request(_frame: Buffer, _timeoutMs: number): Promise<Buffer> {
    const body = Buffer.alloc(3 + this.responseRegisters.length * 2);
    body.writeUInt8(1, 0);
    body.writeUInt8(0x03, 1);
    body.writeUInt8(this.responseRegisters.length * 2, 2);
    this.responseRegisters.forEach((register, index) => {
      body.writeUInt16BE(register, 3 + index * 2);
    });
    return appendCrc(body);
  }
}
