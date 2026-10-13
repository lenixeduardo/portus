import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SerialPort } from 'serialport';
import type { Equipment } from '../../shared/types';
import { appendCrc } from '../serial/modbus-frame';
import { startModbusPolling } from '../serial/modbus-poller';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('never reports another slave response as the configured equipment reading', async () => {
  const port = Object.assign(new EventEmitter(), { isOpen: true, write: (_frame: Buffer, cb: () => void) => cb() });
  const readings: string[] = []; const errors: string[] = [];
  const stop = startModbusPolling(port as unknown as SerialPort, { slotIndex: 1, modbusUnitId: 1, modbusFunction: 3, modbusStartAddress: 0, modbusQuantity: 1, modbusRegisterDecode: 'uint16', modbusPollIntervalMs: 100, modbusResponseTimeoutMs: 50 } as Equipment, { onReading: r => readings.push(r.valueParsed!), onError: (_code, message) => errors.push(message), onStatus: () => undefined });
  try {
    port.emit('data', appendCrc(Buffer.from([2, 3, 2, 0, 42])));
    expect(readings).toEqual([]); expect(errors.length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(100);
    port.emit('data', appendCrc(Buffer.from([1, 3, 2, 0, 43])));
    expect(readings).toEqual(['43']);
  } finally { stop(); }
});
