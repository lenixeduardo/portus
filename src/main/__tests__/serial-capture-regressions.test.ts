import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Equipment } from '../../shared/types';

const state = vi.hoisted(() => ({ equipments: [] as Equipment[], ports: [] as any[], failPaths: new Set<string>(), events: [] as any[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (channel: string, data: unknown) => state.events.push({ channel, data }) } }] } }));
vi.mock('serialport', () => ({ SerialPort: class extends EventEmitter {
  isOpen = false;
  path: string;
  onClose?: () => void;
  constructor(options: { path: string }) { super(); this.path = options.path; state.ports.push(this); }
  open(cb: (error?: Error) => void) { if (state.failPaths.has(this.path)) cb(new Error('Port unavailable')); else { this.isOpen = true; cb(); } }
  write(_frame: Buffer, cb: (error?: Error) => void) { cb?.(); }
  close(cb: () => void) { this.onClose?.(); this.isOpen = false; this.emit('close'); cb?.(); }
} }));
vi.mock('../db/central-connection', () => ({ isCentralDatabaseConfigured: () => true }));
vi.mock('../db/central-station-settings-repo', () => ({ getCentralStationIdentity: async () => ({ code: 'QA', name: 'QA', sectorCode: 'PRODUCTION' }), getCentralCaptureTimeoutSeconds: async () => 60 }));
vi.mock('../db/central-equipments-repo', () => ({ listCentralEquipments: async () => state.equipments, updateCentralEquipment: vi.fn(async (id: number, patch: Partial<Equipment>) => Object.assign(state.equipments.find(e => e.id === id)!, patch)) }));
vi.mock('../db/central-capture-repo', () => ({ getCentralBatchById: async () => ({ id: 7, status: 'open' }), isSectorCaptureClosed: () => false, validateCentralEquipmentMapping: async () => [], createCentralCaptureSession: async () => ({ id: 9 }), finishCentralCaptureSession: vi.fn(async () => undefined), insertCentralReading: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../db/capture-error-logs-repo', () => ({ insertCaptureErrorLog: vi.fn(async () => undefined) }));
vi.mock('../auth/auth-service', () => ({ getCurrentUser: () => null, logout: vi.fn() }));
vi.mock('../db/audit-repo', () => ({ logAudit: vi.fn(async () => undefined) }));

import { startCapture, cancelCapture, completeCapture, isActive, getState } from '../serial/capture-service';
import { insertCentralReading } from '../db/central-capture-repo';
import { insertCaptureErrorLog } from '../db/capture-error-logs-repo';

function equipment(patch: Partial<Equipment> = {}): Equipment {
  return { id: 1, slotIndex: 1, name: 'QA', enabled: true, portPath: 'COM1', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', lineDelimiter: 'lf', protocol: 'passive', skipFirstReading: false, stopAfterFirstReading: false, ...patch } as Equipment;
}
async function begin() { expect((await startCapture(7, [1], 'qa')).ok).toBe(true); }
function send(value: string, port = state.ports[0]) { port.emit('data', Buffer.from(value, 'latin1')); }
function values() { return vi.mocked(insertCentralReading).mock.calls.map(([input]) => input.valueRaw); }

describe('serial capture recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); state.ports = []; state.events = []; state.failPaths.clear(); state.equipments = [equipment()]; vi.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(async () => { if (isActive()) await cancelCapture(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it('shares one COM7 port across two Modbus register slots and keeps it open for the second slot', async () => {
    state.equipments = [
      equipment({ id: 7, slotIndex: 1, name: 'PV7', portPath: 'COM7', protocol: 'modbus_rtu', modbusUnitId: 1, modbusFunction: 3, modbusStartAddress: 6, modbusQuantity: 1, modbusPollIntervalMs: 1000, modbusResponseTimeoutMs: 100 }),
      equipment({ id: 8, slotIndex: 2, name: 'PV8', portPath: 'COM7', protocol: 'modbus_rtu', modbusUnitId: 1, modbusFunction: 3, modbusStartAddress: 7, modbusQuantity: 1, modbusPollIntervalMs: 1000, modbusResponseTimeoutMs: 100 })
    ];
    expect((await startCapture(7, [7, 8], 'qa')).ok).toBe(true);
    expect(state.ports.filter(port => port.path === 'COM7')).toHaveLength(1);
    expect(getState().slots.map(slot => slot.status)).toEqual(['open', 'open']);
    await cancelCapture();
    expect(state.ports[0].isOpen).toBe(false);
  });
  it('captures laboratory readings on a production station under the laboratory sector', async () => {
    expect((await startCapture(7, [1], 'lab', 'LABORATORY')).ok).toBe(true);
    send('10\n');
    await completeCapture();
    expect(vi.mocked(insertCentralReading).mock.calls[0][0]).toMatchObject({ username: 'lab', sectorCode: 'LABORATORY', valueRaw: '10' });
  });
  it('records only the first line of a combined chunk for stopAfterFirstReading', async () => {
    state.equipments = [equipment({ stopAfterFirstReading: true })]; await begin();
    send('10\n20\n30'); await completeCapture();
    expect(values()).toEqual(['10']);
  });
  it('preserves normal lines and flushes a valid partial tail at completion', async () => {
    state.equipments = [equipment({ lineDelimiter: 'crlf' })]; await begin();
    send('10\r'); send('\n20\r\n30'); await completeCapture();
    expect(values()).toEqual(['10', '20', '30']);
  });
  it('ignores bytes arriving while closing ports during cleanup', async () => {
    await begin(); send('10'); state.ports[0].onClose = () => send('20\n');
    await completeCapture(); expect(values()).toEqual(['10']);
  });
  it('accepts a line at the limit when CRLF arrives fragmented', async () => {
    state.equipments = [equipment({ lineDelimiter: 'crlf' })]; await begin();
    send('7'.repeat(102400) + '\r'); send('\n42\r\n');
    expect(values().map(value => value.length)).toEqual([102400, 2]);
    expect(values()[1]).toBe('42');
  });
  it('skips the first line then stops after the first accepted line', async () => {
    state.equipments = [equipment({ stopAfterFirstReading: true, skipFirstReading: true })]; await begin();
    send('header\n42\n43\n'); send('44\n'); await completeCapture(); expect(values()).toEqual(['42']);
  });
  it('keeps equipment enabled after a temporary COM failure and recovers next capture', async () => {
    state.failPaths.add('COM1'); const started = startCapture(7, [1], 'qa');
    await vi.advanceTimersByTimeAsync(300); expect((await started).ok).toBe(true);
    expect(getState().slots[0].status).toBe('error'); await cancelCapture();
    state.failPaths.clear(); await begin(); send('42\n', state.ports.at(-1));
    expect(values()).toEqual(['42']);
  });
  it('discards an overflowing unterminated line rather than flushing it as a reading', async () => {
    await begin(); send('x'.repeat(102401)); send('123'); await completeCapture();
    expect(values()).toEqual([]);
    expect(vi.mocked(insertCaptureErrorLog).mock.calls.some(([input]) => input.code === 'serial_buffer_overflow')).toBe(true);
  });
  it('recovers after an overflow with a fragmented CRLF delimiter', async () => {
    state.equipments = [equipment({ lineDelimiter: 'crlf' })]; await begin();
    send('x'.repeat(102401) + '\r'); send('\n42\r'); send('\n');
    expect(values()).toEqual(['42']);
  });
  it('rejects an oversized complete line and preserves subsequent valid lines', async () => {
    await begin(); send('x'.repeat(102401) + '\n42\n');
    expect(values()).toEqual(['42']);
  });
  it('keeps the passive listener working through reconnection', async () => {
    await begin(); const port = state.ports[0]; port.isOpen = false; port.emit('close'); send('42\n', port);
    expect(values()).toEqual(['42']); expect(getState().slots[0].status).toBe('receiving');
  });
  it('applies overflow recovery to a fallback port', async () => {
    state.equipments.push(equipment({ id: 6, slotIndex: 6, name: 'Reserva', enabled: false, portPath: 'COM6' }));
    state.failPaths.add('COM1'); const started = startCapture(7, [1], 'qa'); await vi.advanceTimersByTimeAsync(300); expect((await started).ok).toBe(true);
    const fallback = state.ports.at(-1); expect(fallback.path).toBe('COM6');
    send('x'.repeat(102401), fallback); send('\n42\n', fallback); expect(values()).toEqual(['42']);
  });
});
