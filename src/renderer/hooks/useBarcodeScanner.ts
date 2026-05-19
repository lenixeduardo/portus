import { useEffect, useRef } from "react";

// HID barcode scanners send keystrokes much faster than a human can type.
// We treat a sequence as scanner input when every keystroke arrives within
// SCAN_INTERVAL_MS of the previous one AND the sequence ends with Enter.
const SCAN_INTERVAL_MS = 50;
const MIN_BARCODE_LENGTH = 4;

export function useBarcodeScanner(
  onScan: (code: string) => void,
  enabled = true
): void {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore events from input/textarea/select — don't intercept manual form input.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const now = Date.now();

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        lastKeyTimeRef.current = 0;
        if (code.length >= MIN_BARCODE_LENGTH) {
          onScanRef.current(code);
        }
        return;
      }

      // Non-printable keys reset the buffer.
      if (e.key.length !== 1) {
        bufferRef.current = "";
        lastKeyTimeRef.current = 0;
        return;
      }

      const elapsed = now - lastKeyTimeRef.current;

      // If this character arrived too slowly after the last one, start fresh.
      if (bufferRef.current.length > 0 && elapsed > SCAN_INTERVAL_MS) {
        bufferRef.current = "";
      }

      bufferRef.current += e.key;
      lastKeyTimeRef.current = now;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
