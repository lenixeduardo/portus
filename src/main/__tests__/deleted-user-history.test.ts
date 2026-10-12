import { describe, expect, it } from 'vitest';
import { toBatch } from '../db/central-batches-repo';

describe('historico depois de remover o criador', () => {
  it('mantem o lote sem inventar um ID de usuario', () => {
    const batch = toBatch({
      id: 11, product_id: 5, product_name: 'Produto', code: 'LOTE-11',
      status: 'open', stage: 'A', opened_at: '2026-10-12T12:00:00Z',
      closed_at: null, closed_by: null, created_by: null,
      readings_count: '1', production_readings_count: '1', laboratory_readings_count: '0',
      operator_name: 'Usuário excluído', production_closed: false,
      laboratory_closed: false, reading_previews: null
    } as any);
    expect(batch.id).toBe(11);
    expect(batch.createdBy).toBeUndefined();
    expect(batch.operatorName).toBe('Usuário excluído');
  });
});
