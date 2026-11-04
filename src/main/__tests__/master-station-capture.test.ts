import { describe, expect, it } from 'vitest';
import { resolveCaptureSector } from '../../shared/user-sector';

describe('setor da captura por estacao', () => {
  it.each(['PRODUCTION', 'LABORATORY'] as const)('Master utiliza o setor %s da maquina', (station) => {
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'ADMIN' }, station)).toBe(station);
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'PRODUCTION' }, station)).toBe(station);
  });
  it.each(['PRODUCTION', 'LABORATORY'] as const)('operador de %s segue o setor da máquina', (userSector) => {
    for (const station of ['PRODUCTION', 'LABORATORY'] as const) {
      expect(resolveCaptureSector({ role: 'operator', sectorCode: userSector }, station)).toBe(station);
    }
  });
  it('Ludmila, do Laboratório, captura como Produção na máquina de Produção', () => {
    expect(resolveCaptureSector({ role: 'operator', sectorCode: 'LABORATORY' }, 'PRODUCTION')).toBe('PRODUCTION');
  });
  it('mantém o setor físico para o supervisor', () => {
    expect(resolveCaptureSector({ role: 'supervisor', sectorCode: 'LABORATORY' }, 'PRODUCTION')).toBe('PRODUCTION');
  });
  it('perfil administrativo sem Master continua sem setor de captura', () => {
    expect(() => resolveCaptureSector({ role: 'admin', sectorCode: 'ADMIN' }, 'PRODUCTION')).toThrow();
  });
  it('operador do Laboratorio captura na estacao correta', () => {
    expect(resolveCaptureSector({ role: 'operator', sectorCode: 'LABORATORY' }, 'LABORATORY')).toBe('LABORATORY');
  });
});
