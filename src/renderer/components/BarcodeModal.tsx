import React, { useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import type { BarcodeScanResult, BatchWithProduct } from "../../shared/ipc";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  onBatchReady: (batch: BatchWithProduct) => void;
}

export function BarcodeModal({ onClose, onBatchReady }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    inputRef.current?.focus();
    return () => { mountedRef.current = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = value.trim();
    if (!barcode) {
      setError("Digite ou escaneie o código de barras antes de confirmar.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await window.api.batches.scanBarcode({ barcodeValue: barcode });
    if (!mountedRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setValue("");
      return;
    }
    setResult(res.data);
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
        ) : (
          <>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={handleSubmit} disabled={loading || !value.trim()}>
              {loading ? "Processando..." : "Confirmar"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <BarcodeResult result={result} />
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
