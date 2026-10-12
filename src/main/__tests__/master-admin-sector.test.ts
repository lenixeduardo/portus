import { describe, expect, it } from 'vitest';
import { createUserSchema } from '../validation/schemas';

describe('setor administrativo do Master', () => {
  const base = { username: 'master.qa', password: 'senha-segura-123', role: 'master' };
  it('normaliza o cadastro legado de Master em Producao para ADMIN', () => {
    expect(createUserSchema.parse({ ...base, sectorCode: 'PRODUCTION' }).sectorCode).toBe('ADMIN');
  });
  it('aceita o setor ADMIN mantendo o perfil master', () => {
    const result = createUserSchema.parse({ ...base, sectorCode: 'ADMIN' });
    expect(result.role).toBe('master');
    expect(result.sectorCode).toBe('ADMIN');
  });
  it('nao permite colocar operador no setor administrativo', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'operator', sectorCode: 'ADMIN' }).success).toBe(false);
  });
  it('preserva os setores operacionais', () => {
    expect(createUserSchema.parse({ ...base, role: 'operator', sectorCode: 'LABORATORY', laboratoryProfile: 'capture' }).sectorCode).toBe('LABORATORY');
    expect(createUserSchema.parse({ ...base, role: 'supervisor', sectorCode: 'PRODUCTION' }).sectorCode).toBe('PRODUCTION');
  });
});
