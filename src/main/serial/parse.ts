import type { LineDelimiter } from "../../shared/types";

// Mapeia o token de delimitador configurado por equipamento para os caracteres
// reais. O default ("lf") é tolerante: ao dividir em "\n", linhas terminadas em
// CRLF deixam um "\r" residual que é removido no trim — cobrindo LF e CRLF.
// Apenas equipamentos CR-only precisam explicitamente de "cr".
export function delimiterChars(token: string | undefined): string {
  switch (token) {
    case "cr":
      return "\r";
    case "crlf":
      return "\r\n";
    case "lf":
    default:
      return "\n";
  }
}

// Normaliza separadores numéricos para o formato canônico (ponto decimal),
// aceitando vírgula decimal e ponto de milhar comuns em equipamentos pt-BR.
// Valores não-numéricos são devolvidos apenas com trim.
export function normalizeNumeric(value: string): string {
  const t = value.trim();
  // Agrupado pt-BR: 1.234,56 → 1234.56
  if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(t)) {
    return t.replace(/\./g, "").replace(",", ".");
  }
  // Vírgula decimal simples: 1,234 → 1.234
  if (/^[-+]?\d+,\d+$/.test(t)) {
    return t.replace(",", ".");
  }
  return t;
}

export interface ParseOutcome {
  parsed: string | null;
  failureReason: "no_match" | "invalid_regex" | null;
}

// Extrai e normaliza o valor de uma linha bruta.
// Prioridade de extração: grupo nomeado `value` → primeiro grupo → match completo.
export function parseReading(
  raw: string,
  regex: RegExp | null,
  regexInvalid: boolean
): ParseOutcome {
  if (regexInvalid) {
    return { parsed: null, failureReason: "invalid_regex" };
  }
  if (!regex) {
    return { parsed: normalizeNumeric(raw), failureReason: null };
  }
  const match = raw.match(regex);
  if (!match) {
    return { parsed: null, failureReason: "no_match" };
  }
  const candidate = match.groups?.value ?? match[1] ?? match[0];
  return { parsed: normalizeNumeric(candidate), failureReason: null };
}

export const LINE_DELIMITERS: LineDelimiter[] = ["crlf", "lf", "cr"];
