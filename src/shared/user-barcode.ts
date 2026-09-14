const USER_BARCODE_PATTERN = /^\d{16}$/;

export function isUserBarcode(code: string): boolean {
  return USER_BARCODE_PATTERN.test(code.trim());
}
