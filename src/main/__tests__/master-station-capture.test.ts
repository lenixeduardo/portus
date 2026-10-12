import { describe, expect, it } from 'vitest';
import { resolveCaptureSector } from '../../shared/user-sector';

describe('setor da captura por estacao', () => {
  it.each(['PRODUCTION', 'LABORATORY'] as const)('Master utiliza o setor %s da maquina', (station) => {
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'ADMIN' }, station)).toBe(station);
    expect(resolveCaptureSector({ role: 'master', sectorCode: 'PRODUCTION' }, station)).toBe(station);
  });
  it('operador de Producao continua bloqueado no Laboratorio', () => {
    expect(() => resolveCaptureSector({ role: 'operator', sectorCode: 'PRODUCTION' }, 'LABORATORY')).toThrow(/difere/);
  });
  it('operador do Laboratorio captura na estacao correta', () => {
    expect(resolveCaptureSector({ role: 'operator', sectorCode: 'LABORATORY' }, 'LABORATORY')).toBe('LABORATORY');
  });
});
