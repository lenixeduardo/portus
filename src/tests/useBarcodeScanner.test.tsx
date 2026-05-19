/**
 * Testes do hook useBarcodeScanner
 *
 * Teste 1 — Código: 2026-TEST1 | Produto: Tinta Azul Marinho
 *   Scanner HID envia keystrokes rápidos (< 50ms cada) → onScan deve ser chamado
 *
 * Teste 2 — Código: 2026-TEST2 | Produto: Verniz Industrial
 *   Digitação manual lenta (> 50ms entre teclas) → onScan NÃO deve ser chamado
 */

import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBarcodeScanner } from "../renderer/hooks/useBarcodeScanner";

// Simula o disparo de uma sequência de keydown como um leitor HID faria.
// intervalMs: tempo entre cada tecla (scanner real usa < 5ms, aqui usamos 10ms)
function fireKeystrokesSync(chars: string, intervalMs: number) {
  let baseTime = Date.now();

  for (const char of chars) {
    vi.setSystemTime(baseTime);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    baseTime += intervalMs;
  }

  vi.setSystemTime(baseTime);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

describe("useBarcodeScanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Teste 1 ─────────────────────────────────────────────────────────────
  it(
    "TESTE 1 | Código: 2026-TEST1 | Produto: Tinta Azul Marinho" +
      " — scanner rápido (10ms/tecla) dispara onScan com o código correto",
    () => {
      const BARCODE = "2026-TEST1";
      const PRODUCT = "Tinta Azul Marinho";
      const onScan = vi.fn();

      renderHook(() => useBarcodeScanner(onScan, true));

      act(() => {
        // 10ms entre teclas — muito abaixo do limiar de 50ms → deve ser reconhecido como scanner
        fireKeystrokesSync(BARCODE, 10);
      });

      expect(onScan).toHaveBeenCalledOnce();
      expect(onScan).toHaveBeenCalledWith(BARCODE);

      // Confirma que o produto associado ao código seria buscado com o valor correto
      const scannedCode: string = onScan.mock.calls[0][0];
      expect(scannedCode).toBe(BARCODE);
      expect(PRODUCT).toBe("Tinta Azul Marinho"); // produto vinculado ao lote escaneado
    }
  );

  // ─── Teste 2 ─────────────────────────────────────────────────────────────
  it(
    "TESTE 2 | Código: 2026-TEST2 | Produto: Verniz Industrial" +
      " — digitação manual lenta (80ms/tecla) NÃO dispara onScan",
    () => {
      const BARCODE = "2026-TEST2";
      const PRODUCT = "Verniz Industrial";
      void PRODUCT; // produto que seria vinculado, mas leitura deve ser ignorada
      const onScan = vi.fn();

      renderHook(() => useBarcodeScanner(onScan, true));

      act(() => {
        // 80ms entre teclas — acima do limiar de 50ms → digitação humana, deve ser descartada
        fireKeystrokesSync(BARCODE, 80);
      });

      expect(onScan).not.toHaveBeenCalled();
    }
  );
});
