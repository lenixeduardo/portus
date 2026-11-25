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

import { startCapture, cancelCapture, completeCapture, isActive, getState, injectManualReading } from '../serial/capture-service';
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
  it('simulates PV7 and PV8 independently on COM7 while preserving other configured readings', async () => {
    state.equipments = [
      equipment({ id: 7, slotIndex: 1, name: 'PV7', portPath: 'COM7', protocol: 'modbus_rtu', modbusUnitId: 1, modbusFunction: 3, modbusStartAddress: 6, modbusQuantity: 1 }),
      equipment({ id: 8, slotIndex: 2, name: 'PV8', portPath: 'COM7', protocol: 'modbus_rtu', modbusUnitId: 1, modbusFunction: 3, modbusStartAddress: 7, modbusQuantity: 1 }),
      equipment({ id: 9, slotIndex: 3, name: 'Balanca', portPath: 'COM9', protocol: 'passive' })
    ];
    const started = await startCapture(7, [7, 8, 9], 'qa', 'PRODUCTION', true);
    expect(started.ok).toBe(true);
    expect(state.ports).toHaveLength(0); // simulação não acessa COM física
    expect(getState().slots.map(slot => slot.name)).toEqual(['PV7', 'PV8', 'Balanca']);
    for (const [slotIndex, rawValue] of [[1, '10.00'], [2, '11.25'], [3, '12.50']] as const) {
      expect(injectManualReading(slotIndex, rawValue).ok).toBe(true);
    }
    expect(vi.mocked(insertCentralReading).mock.calls.map(([reading]) => ({
      equipmentId: reading.equipmentId,
      equipmentName: reading.equipmentName,
      valueRaw: reading.valueRaw
    }))).toEqual([
      { equipmentId: 7, equipmentName: 'PV7', valueRaw: '10.00' },
      { equipmentId: 8, equipmentName: 'PV8', valueRaw: '11.25' },
      { equipmentId: 9, equipmentName: 'Balanca', valueRaw: '12.50' }
    ]);
    expect((await completeCapture()).ok).toBe(true);
  });
  it('stores only one reading per equipment across distinct serial ports', async () => {
    state.equipments = [
      equipment({ id: 1, slotIndex: 1, portPath: 'COM1', singleReadingPerCapture: true }),
      equipment({ id: 2, slotIndex: 2, portPath: 'COM2', singleReadingPerCapture: true })
    ];
    expect((await startCapture(7, [1, 2], 'qa')).ok).toBe(true);
    send('10\n11\n', state.ports[0]);
    send('20\n21\n', state.ports[1]);
    expect(vi.mocked(insertCentralReading).mock.calls.map(([reading]) => [reading.equipmentId, reading.valueRaw])).toEqual([[1, '10'], [2, '20']]);
  });
  it('ignores repeated simulated readings and accepts a new reading in the next capture', async () => {
    state.equipments = [equipment({ singleReadingPerCapture: true })];
    expect((await startCapture(7, [1], 'qa', 'PRODUCTION', true)).ok).toBe(true);
    expect(injectManualReading(1, '10').ok).toBe(true);
    expect(injectManualReading(1, '11').ok).toBe(true);
    expect(values()).toEqual(['10']);
    expect((await completeCapture()).ok).toBe(true);
    expect((await startCapture(7, [1], 'qa', 'PRODUCTION', true)).ok).toBe(true);
    expect(injectManualReading(1, '12').ok).toBe(true);
    expect(values()).toEqual(['10', '12']);
  });
  it('Simular Scan combines Marte MVD-8 readings without a physical COM port', async () => {
    state.equipments = [equipment({ name: 'Viscosímetro', singleReadingPerCapture: false })];
    expect((await startCapture(7, [1], 'qa', 'PRODUCTION', true)).ok).toBe(true);
    for (const line of ['on', '00:00:00 20.8°C', 'SP:L1 30.0RPM', '2.6% 5.151515cP', 'off']) {
      expect(injectManualReading(1, line).ok).toBe(true);
    }
    expect(values()).toEqual(['TEMP: 20.8°C\nSP:L1 30.0RPM\n2.6% | 5.151515cP']);
    expect((await completeCapture()).ok).toBe(true);
  });
  it('assembles Marte MVD-8 spindle and viscosity across serial chunks', async () => {
    state.equipments = [equipment({ name: 'Viscosímetro', parseRegex: '(?<value>\\d+)' })];
    await begin();
    send('on\r\n00:00:00 20.8°C\r\nSP:L1 30.0RPM\r\n2.6% ');
    send('5.151515cP\r\noff\r\n');
    expect(values()).toEqual(['TEMP: 20.8°C\nSP:L1 30.0RPM\n2.6% | 5.151515cP']);
  });
  it('keeps MVD-8 temperatures with their own measurements across byte boundaries', async () => {
    state.equipments = [equipment({ name: 'MARTE MVD8', parseRegex: '(?<value>TESTE123456)' })];
    await begin();
    const first = Buffer.from('00:09:30  21.9°C\r\nSP:L1 30.0RPM\r\n 0.0%      0.0cP\r\n');
    const degree = first.indexOf(0xc2);
    const terminator = first.indexOf(0x0a);
    state.ports[0].emit('data', first.subarray(0, degree + 1));
    state.ports[0].emit('data', first.subarray(degree + 1, terminator));
    state.ports[0].emit('data', Buffer.concat([
      first.subarray(terminator),
      Buffer.from('00:09:40 -1,2?C\nSP:L2 60.0RPM\n4.0% 2.0cP\n')
    ]));
    const expected = [
      'TEMP: 21.9°C\nSP:L1 30.0RPM\n0.0% | 0.0cP',
      'TEMP: -1,2°C\nSP:L2 60.0RPM\n4.0% | 2.0cP'
    ];
    expect(values()).toEqual(expected);
    expect(vi.mocked(insertCentralReading).mock.calls.map(([reading]) => reading.valueParsed)).toEqual(expected);
  });
  it('clears incomplete MVD-8 measurements at stream boundaries', async () => {
    state.equipments = [equipment({ name: 'Viscosímetro' })];
    await begin();
    send('00:00:01 21.0°C\nSP:L1 30.0RPM\noff\n0.0% 0.0cP\n');
    send('00:00:02 22.0°C\non\nSP:L2 30.0RPM\n0.0% 0.0cP\n');
    send('00:00:03 23.0°C\nSP:L1 30.0RPM\n00:00:04 inválida\n0.0% 0.0cP\nSP:L3 30.0RPM\n0.0% 0.0cP\n');
    send('00:00:05 24.0°C\nSP:L1 30.0RPM\n0.0% ');
    state.ports[0].emit('close');
    send('0.0cP\nSP:L4 30.0RPM\n0.0% 0.0cP\n');
    send('00:00:06 25.0°C\n0.0% 0.0cP\nSP:L5 30.0RPM\n0.0% 0.0cP\n');
    expect(values()).toEqual([
      'SP:L2 30.0RPM | 0.0% 0.0cP',
      'SP:L3 30.0RPM | 0.0% 0.0cP',
      'SP:L4 30.0RPM | 0.0% 0.0cP',
      'SP:L5 30.0RPM | 0.0% 0.0cP'
    ]);
  });
  it('records multiple valid readings by default when checkbox is disabled', async () => {
    state.equipments = [equipment({ singleReadingPerCapture: false })];
    await begin();
    send('10\n11\n12\n');
    expect(values()).toEqual(['10', '11', '12']);
  });
  it('does not consume the reading quota on an invalid parse', async () => {
    state.equipments = [equipment({ parseRegex: '^VAL:(\\d+)$', singleReadingPerCapture: true })];
    await begin();
    send('invalid\nVAL:42\nVAL:43\n');
    expect(values()).toEqual(['VAL:42']);
  });
  it('honors skip-first-reading before accepting one subsequent reading', async () => {
    state.equipments = [equipment({ skipFirstReading: true, singleReadingPerCapture: true })];
    await begin();
    send('header\n42\n43\n');
    expect(values()).toEqual(['42']);
  });
});
