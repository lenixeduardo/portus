const USER_BARCODE_MIN_LENGTH = 3;
const USER_BARCODE_MAX_LENGTH = 64;
const USER_BARCODE_PATTERN = /^[A-Z0-9 ]+$/;
const ASCII_LETTER = /[A-Z]/;

export function normalizeUserBarcode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Heurística para etiquetas de usuário ainda não cadastradas.
 * Valores já cadastrados são sempre resolvidos primeiro pela base.
 */
export function isUserBarcode(code: string): boolean {
  const normalized = normalizeUserBarcode(code);
  return normalized.length >= USER_BARCODE_MIN_LENGTH
    && normalized.length <= USER_BARCODE_MAX_LENGTH
    && ASCII_LETTER.test(normalized)
    && USER_BARCODE_PATTERN.test(normalized);
}
