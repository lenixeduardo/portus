export function normalizeUsername(displayName: string): string {
  const normalized = displayName
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  if (!normalized) {
    throw new Error("Informe um nome válido para gerar o usuário.");
  }

  return normalized;
}

export function generateUniqueUsername(
  displayName: string,
  exists: (username: string) => boolean
): string {
  const base = normalizeUsername(displayName);
  if (!exists(base)) return base;

  let suffix = 2;
  while (exists(`${base}${suffix}`)) {
    suffix += 1;
  }

  return `${base}${suffix}`;
}
