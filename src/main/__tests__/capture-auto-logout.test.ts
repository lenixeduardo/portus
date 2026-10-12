import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ row: {} as any, events: [] as Array<{ channel: string; data: any }> }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (channel: string, data: any) => state.events.push({ channel, data }) } }] } }));
vi.mock('serialport', () => ({ SerialPort: class {} }));
vi.mock('../db/central-connection', () => ({
  isCentralDatabaseConfigured: () => true,
  centralQuery: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM public.users') ? [state.row] : [] }))
}));
vi.mock('../db/central-station-settings-repo', () => ({
  getRuntimeStationCode: () => 'PRODUCAO-QA',
  getCentralStationIdentity: async () => ({ code: 'PRODUCAO-QA', name: 'QA', sectorCode: 'PRODUCTION' }),
  getCentralCaptureTimeoutSeconds: async () => 1
}));
vi.mock('../db/central-equipments-repo', () => ({
  listCentralEquipments: async () => [{ id: 1, slotIndex: 1, name: 'Balanca', enabled: true, lineDelimiter: 'lf', protocol: 'passive' }],
  updateCentralEquipment: vi.fn()
}));
vi.mock('../db/central-capture-repo', () => ({
  createCentralCaptureSession: async () => ({ id: 9 }),
  finishCentralCaptureSession: vi.fn(async () => undefined),
  getCentralBatchById: async () => ({ id: 7, status: 'open' }),
  insertCentralReading: vi.fn(async () => ({ id: 1 })),
  validateCentralEquipmentMapping: async () => [],
  isSectorCaptureClosed: () => false
}));

import { loginByBarcode, getCurrentUser, logout } from '../auth/auth-service';
import { startCapture, completeCapture, cancelCapture, injectManualReading, isActive } from '../serial/capture-service';
import { centralQuery } from '../db/central-connection';
import { finishCentralCaptureSession, insertCentralReading } from '../db/central-capture-repo';
import { IPC } from '../../shared/ipc';

async function begin(role = 'operator') {
  state.row = { id: 2, username: 'operador.qa', password_hash: 'unused', display_name: 'QA',
    role, sector_code: role === 'master' ? 'ADMIN' : 'PRODUCTION',
    laboratory_profile: null, created_at: '2026-10-12T12:00:00Z' };
  await loginByBarcode('OPERADOR-QA');
  const result = await startCapture(7, [1], state.row.username, 'PRODUCTION', true);
  expect(result.ok).toBe(true);
}

describe('logout ao concluir captura no processo principal', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(centralQuery).mockReset().mockImplementation(async (sql: any) => ({ rows: String(sql).includes('FROM public.users') ? [state.row] : [] }) as any); state.events = []; logout(); });
  afterEach(async () => {
    vi.mocked(finishCentralCaptureSession).mockResolvedValue(undefined);
    vi.mocked(insertCentralReading).mockResolvedValue({ id: 1 } as any);
    if (isActive()) await cancelCapture();
    logout(); vi.useRealTimers(); vi.restoreAllMocks();
  });

  it.each(['operator', 'admin', 'master'])('encerra a sessao de %s mesmo sem um modal ouvindo o evento', async role => {
    await begin(role);
    expect((await completeCapture()).ok).toBe(true);
    expect(getCurrentUser()).toBeNull();
    expect(state.events.find(e => e.channel === IPC.captureEnded)?.data.reason).toBe('completed');
  });

  it('faz logout quando a captura termina pelo contador', async () => {
    await begin(); await vi.advanceTimersByTimeAsync(1000);
    expect(isActive()).toBe(false);
    expect(getCurrentUser()).toBeNull();
  });

  it('aguarda a ultima gravacao antes de encerrar a sessao do usuario', async () => {
    await begin();
    let release!: (value: any) => void;
    vi.mocked(insertCentralReading).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    expect(injectManualReading(1, '10.5').ok).toBe(true);
    const completed = completeCapture(); await Promise.resolve();
    expect(getCurrentUser()?.username).toBe('operador.qa');
    release({ id: 1 }); await completed;
    expect(getCurrentUser()).toBeNull();
  });

  it('cancelamento manual mantem a sessao', async () => {
    await begin(); await cancelCapture();
    expect(getCurrentUser()?.username).toBe('operador.qa');
  });

  it('mostra falha de encerramento e nao finge conclusao nem logout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await begin();
    vi.mocked(finishCentralCaptureSession).mockRejectedValueOnce(new Error('Banco indisponivel'));
    expect((await completeCapture()).ok).toBe(false);
    expect(getCurrentUser()?.username).toBe('operador.qa');
    const event = state.events.find(e => e.channel === IPC.captureEnded)?.data;
    expect(event.reason).toBe('cancelled');
    expect(event.error).toContain('Banco indisponivel');
  });

  it('falha de auditoria nao impede encerrar a sessao', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await begin();
    vi.mocked(centralQuery).mockRejectedValueOnce(new Error('Auditoria indisponivel'));
    expect((await completeCapture()).ok).toBe(true);
    expect(getCurrentUser()).toBeNull();
  });

  it('nao encerra uma sessao nova que substituiu o dono da captura', async () => {
    await begin(); state.row = { ...state.row, id: 3, username: 'outro.qa' };
    await loginByBarcode('OUTRO-QA'); await completeCapture();
    expect(getCurrentUser()?.username).toBe('outro.qa');
  });
});
