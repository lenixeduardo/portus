import { describe, expect, it } from 'vitest';
import { resolveCaptureSector } from '../../shared/user-sector';

describe('setor da captura por estacao', () => {
  it.each(['PRODUCTION', 'LABORATORY'] as const)('Master utiliza o setor %s da maquina', (station) => {
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'ADMIN' }, station)).toBe(station);
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'PRODUCTION' }, station)).toBe(station);
  });
  it.each(['PRODUCTION', 'LABORATORY'] as const)('operador segue seu setor %s em qualquer maquina', (sector) => {
    for (const station of ['PRODUCTION', 'LABORATORY'] as const) {
      expect(resolveCaptureSector({ role: 'operator', sectorCode: sector }, station)).toBe(sector);
    }
  });
  it('perfil administrativo sem Master continua sem setor de captura', () => {
    expect(() => resolveCaptureSector({ role: 'admin', sectorCode: 'ADMIN' }, 'PRODUCTION')).toThrow();
  });
  it('operador do Laboratorio captura na estacao correta', () => {
    expect(resolveCaptureSector({ role: 'operator', sectorCode: 'LABORATORY' }, 'LABORATORY')).toBe('LABORATORY');
  });
});
