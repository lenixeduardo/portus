import React, { useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import type { BarcodeScanResult, BatchWithProduct } from "../../shared/ipc";
import { Modal } from "./Modal";
import type { Product } from "../../shared/types";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { scanBarcodeByMode } from "../services/barcode-scan";

interface Props {
  onClose: () => void;
  onBatchReady: (batch: BatchWithProduct) => void;
  initialBarcode?: string;
  centralMode?: boolean;
  scannerOnly?: boolean;
}

export function BarcodeModal({ onClose, onBatchReady, initialBarcode, centralMode = false, scannerOnly = false }: Props) {
  const [value, setValue] = useState(initialBarcode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [lotCode, setLotCode] = useState("");
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerStatusRef = useRef<HTMLParagraphElement>(null);
  const mountedRef = useRef(true);
  const scanningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (initialBarcode) {
      void submitScan(initialBarcode);
    } else {
      // window.focus() reacquires OS-level keyboard focus for the Electron window
      // in case it was lost during a logout/login cycle, then focuses the input.
      window.focus();
      if (scannerOnly) scannerStatusRef.current?.focus();
      else inputRef.current?.focus();
    }
    return () => { mountedRef.current = false; };
  }, []);

  useBarcodeScanner(code => { void submitScan(code); }, scannerOnly && !loading && !pendingBarcode && !result, {
    capture: true,
    ignoreFormFields: false,
    maxIntervalMs: 100,
    acceptTabSuffix: true,
    shouldIntercept: () => true
  });

  // The scanner-only view has no editable field. Restore focus after a retry
  // or returning from the new-batch confirmation screen.
  useEffect(() => {
    if (scannerOnly && !loading && !pendingBarcode && !result) {
      scannerStatusRef.current?.focus();
    }
  }, [scannerOnly, loading, pendingBarcode, result]);

  async function submitScan(barcode: string) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      await scan(barcode);
    } finally {
      scanningRef.current = false;
    }
  }

  function showBatch(batch: BatchWithProduct, created: boolean) {
    setPendingBarcode(null);
    if (scannerOnly) onBatchReady(batch);
    else setResult({ batch, created });
  }

  async function scan(barcode: string) {
    setLoading(true);
    setError(null);
    if (centralMode) {
      try {
        const original = barcode.trim();
        if (!mountedRef.current) return;
        const digits = original.replace(/\D/g, "");
        if (!/^\d{16,}$/.test(digits)) {
          if (scannerOnly) {
            const batch = await window.api.central.batches.findByCode(original);
            if (!mountedRef.current) return;
            if (!batch) setError("Lote não encontrado. Leia a etiqueta completa do produto para criar um lote.");
            else if (batch.status === "closed") setError(`O lote ${batch.code} está finalizado.`);
            else showBatch(batch, false);
          } else {
            setError("Etiqueta inválida: informe os 12 dígitos do produto e pelo menos 4 dígitos do lote.");
          }
          return;
        }
        const prefix = digits.slice(0, 12);
        const code = digits.slice(12);
        const lookup = window.api.central.batches.findByBarcode;
        if (typeof lookup === "function") {
          const found = await lookup(original);
          if (!mountedRef.current) return;
          if (!found.ok) { setError(found.error); return; }
          if (found.data) {
            if (found.data.status === "closed") setError(`O lote ${code} deste produto está finalizado.`);
            else showBatch(found.data, false);
            return;
          }
        }
        const products = await window.api.products.list();
        if (!mountedRef.current) return;
        const matches = products.filter(product =>
          [product.description, product.name].some(value =>
            typeof value === "string" && value.replace(/\D/g, "").slice(0, 12) === prefix
          )
        );
        if (matches.length !== 1) {
          setError(matches.length === 0
            ? "Produto não identificado pelo código " + prefix + ". Verifique o cadastro central."
            : "Há mais de um produto associado ao código " + prefix + ". Corrija o cadastro central.");
          return;
        }
        const existing = await window.api.central.batches.findByCode(code, matches[0].id);
        if (!mountedRef.current) return;
        if (existing) {
          if (existing.status === "closed") {
            setError(`O lote ${code} deste produto está finalizado.`);
          } else {
            showBatch(existing, false);
          }
          return;
        }
        setMatchedProduct(matches[0]);
        setProductId(matches[0].id);
        setLotCode(code);
        setPendingBarcode(original);
        return;
      } catch (error) {
        if (mountedRef.current) setError(scannerOnly && error instanceof Error
          ? error.message
          : "Não foi possível verificar o lote no banco central.");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      return;
    }
    const res = await scanBarcodeByMode(window.api, barcode, centralMode, productId);
    if (!mountedRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      if (!initialBarcode) setValue("");
      return;
    }
    showBatch(res.data.batch, res.data.created);
  }

  async function createConfirmedBatch() {
    if (!pendingBarcode || loading) return;
    const code = lotCode.trim();
    if (!/^[0-9]{4,}$/.test(code)) {
      setError("O número do lote deve conter pelo menos quatro dígitos.");
      return;
    }
    if (productId === null || !matchedProduct) { setError("Produto não identificado pelo código de barras."); return; }
    setLoading(true);
    setError(null);
    try {
      const existing = await window.api.central.batches.findByCode(code, productId);
      if (!mountedRef.current) return;
      if (existing) { setError("O lote " + code + " já existe."); return; }
      const created = await window.api.central.batches.create({ productId, code, barcodeValue: pendingBarcode });
      if (!mountedRef.current) return;
      if (!created.ok) { setError(created.error); return; }
      showBatch(created.data, true);
    } catch {
      if (mountedRef.current) setError("Não foi possível criar o lote.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = value.trim();
    if (!barcode) {
      setError("Digite ou escaneie o código de barras antes de confirmar.");
      return;
    }
    await submitScan(barcode);
  }

  return (
    <Modal
      title="Scanner de Código de Barras"
      onClose={onClose}
      footer={
        result ? (
          <>
            <button className="secondary" onClick={onClose}>Fechar</button>
            <button onClick={() => onBatchReady(result.batch)}>
              Iniciar Leitura
            </button>
          </>
        ) : pendingBarcode ? (
          <>
            <button className="secondary" onClick={() => { setPendingBarcode(null); setError(null); }}>Voltar</button>
            <button onClick={() => void createConfirmedBatch()} disabled={loading || !/^[0-9]{4,}$/.test(lotCode) || productId === null}>
              {loading ? "Criando..." : "Confirmar novo lote"}
            </button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            {!scannerOnly && (
              <button onClick={handleSubmit} disabled={loading || !value.trim()}>
                {loading ? "Processando..." : "Confirmar"}
              </button>
            )}
          </>
        )
      }
    >
      {result ? (
        <BarcodeResult result={result} />
      ) : pendingBarcode ? (
        <div>
          <p className="muted">{scannerOnly
            ? "Novo lote identificado. Confira os dados antes de confirmar a criação."
            : "Confira ou altere o número do lote antes de confirmar a criação."}</p>
          <div className="field">
            {scannerOnly ? (
              <><label>Número do lote</label><strong className="mono">{lotCode}</strong></>
            ) : (
              <>
                <label htmlFor="lot-code">Número do lote (mínimo 4 dígitos)</label>
                <input id="lot-code" className="mono" inputMode="numeric" autoFocus
                  value={lotCode} onChange={(event) => { setLotCode(event.target.value.replace(/[^0-9]/g, "")); setError(null); }} />
              </>
            )}
            <small className="muted">Número completo do lote identificado na etiqueta {pendingBarcode}.</small>
          </div>
          <div className="field">
            <label>Produto identificado</label>
            <strong>{matchedProduct?.name}</strong>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      ) : scannerOnly ? (
        <>
          <p ref={scannerStatusRef} tabIndex={-1} role="status">{loading ? "Consultando lote..." : "Aponte o leitor para o código de barras da etiqueta."}</p>
          {error && <div className="error" role="alert">{error}</div>}
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, color: "#6B7280" }}>
            <ScanBarcode size={48} strokeWidth={1.2} />
          </div>
          <div className="field">
            <label>Código de barras</label>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              placeholder="Aponte o leitor ou digite o código..."
              className="mono"
              disabled={loading}
              autoComplete="off"
            />
            <small className="muted">
              Posicione o cursor aqui e use o leitor. O código é enviado automaticamente ao pressionar Enter.
            </small>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" style={{ display: "none" }} />
        </form>
      )}
    </Modal>
  );
}

function BarcodeResult({ result }: { result: BarcodeScanResult }) {
  const { batch, created } = result;
  const bannerStyle: React.CSSProperties = created
    ? { background: "#ECFDF5", borderColor: "#10B981", color: "#065F46" }
    : { background: "#EFF6FF", borderColor: "#3B82F6", color: "#1E3A8A" };

  return (
    <div>
      <div
        className="alert"
        style={{ ...bannerStyle, border: "1px solid", borderRadius: 6, padding: "10px 14px", marginBottom: 16 }}
      >
        {created ? (
          <>Lote <strong>{batch.code}</strong> criado com sucesso.</>
        ) : (
          <>Lote <strong>{batch.code}</strong> encontrado. Pronto para iniciar leitura.</>
        )}
      </div>
      <div className="batch-card" style={{ cursor: "default" }}>
        <div className="batch-card-head">
          <div>
            <div className="batch-code">#{batch.code}</div>
            <div className="batch-recipe">{batch.productName}</div>
          </div>
          <span className="chip chip-green">ABERTO</span>
        </div>
        <div className="batch-meta">
          <div>
            <span>Operador</span>
            <strong>{batch.operatorName}</strong>
          </div>
          <div>
            <span>Leituras</span>
            <strong>{batch.readingsCount}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
