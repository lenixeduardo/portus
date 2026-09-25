import { useEffect, useRef } from "react";

const SCAN_INTERVAL_MS = 50;
const MIN_BARCODE_LENGTH = 3;

interface BarcodeScannerOptions {
  ignoreFormFields?: boolean;
  capture?: boolean;
  shouldIntercept?: (code: string) => boolean;
}

export function useBarcodeScanner(
  onScan: (code: string) => void,
  enabled = true,
  options: BarcodeScannerOptions = {}
): void {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  const shouldInterceptRef = useRef(options.shouldIntercept);
  onScanRef.current = onScan;
  shouldInterceptRef.current = options.shouldIntercept;

  const {
    ignoreFormFields = true,
    capture = false
  } = options;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (ignoreFormFields && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;

      const now = Date.now();

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        lastKeyTimeRef.current = 0;
        if (code.length >= MIN_BARCODE_LENGTH) {
          if (shouldInterceptRef.current?.(code)) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
          onScanRef.current(code);
        }
        return;
      }

      const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
      if (IGNORED_KEYS.has(e.key)) return;

      if (e.key.length !== 1) {
        bufferRef.current = "";
        lastKeyTimeRef.current = 0;
        return;
      }

      const elapsed = now - lastKeyTimeRef.current;
      if (bufferRef.current.length > 0 && elapsed > SCAN_INTERVAL_MS) {
        bufferRef.current = "";
      }

      bufferRef.current += e.key;
      lastKeyTimeRef.current = now;
    }

    window.addEventListener("keydown", handleKeyDown, capture);
    return () => window.removeEventListener("keydown", handleKeyDown, capture);
  }, [enabled, ignoreFormFields, capture]);
}
