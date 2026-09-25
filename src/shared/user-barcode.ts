const USER_BARCODE_MIN_LENGTH = 3;
const USER_BARCODE_MAX_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const ASCII_LETTER = /[A-Za-z]/;

export function normalizeUserBarcode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Heurística usada apenas para decidir quando uma leitura desconhecida pode
 * representar uma etiqueta de usuário. A autenticação em si consulta o valor
 * persistido e não depende desta classificação.
 */
export function isUserBarcode(code: string): boolean {
  const normalized = normalizeUserBarcode(code);
  return normalized.length >= USER_BARCODE_MIN_LENGTH
    && normalized.length <= USER_BARCODE_MAX_LENGTH
    && ASCII_LETTER.test(normalized)
    && !CONTROL_CHARACTERS.test(normalized);
}
