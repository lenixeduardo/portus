import React, { useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import type { BarcodeScanResult, BatchWithProduct } from "../../shared/ipc";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  onBatchReady: (batch: BatchWithProduct) => void;
  initialBarcode?: string;
}

export function BarcodeModal({ onClose, onBatchReady, initialBarcode }: Props) {
  const [value, setValue] = useState(initialBarcode ?? "");
  const [productName, setProductName] = useState("");
  const [productValue, setProductValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const productNameRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (initialBarcode) {
      scan(initialBarcode);
    } else {
      inputRef.current?.focus();
    }
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (productValue) productNameRef.current?.focus();
  }, [productValue]);

  async function scan(barcode: string, name?: string) {
    setLoading(true);
    setError(null);
    const res = await window.api.batches.scanBarcode({ barcodeValue: barcode, productName: name });
    if (!mountedRef.current) return;
    setLoading(false);
    if (!res.ok) {
      if (res.productValue) {
        setProductValue(res.productValue);
        setError(null);
      } else {
        setError(res.error);
        if (!initialBarcode) setValue("");
      }
      return;
    }
    setProductValue(null);
    setResult(res.data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = value.trim();
    if (!barcode) {
      setError("Digite ou escaneie o código de barras antes de confirmar.");
      return;
    }
    await scan(barcode);
  }

  async function handleRegisterProduct(e: React.FormEvent) {
    e.preventDefault();
    const name = productName.trim();
    if (!name) {
      setError("Digite o nome do produto.");
      return;
    }
    await scan(value.trim(), name);
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
        ) : productValue ? (
          <>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={handleRegisterProduct} disabled={loading || !productName.trim()}>
              {loading ? "Cadastrando..." : "Cadastrar e Criar Lote"}
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
      ) : productValue ? (
        <form onSubmit={handleRegisterProduct}>
          <div className="alert" style={{ marginBottom: 16 }}>
            Produto com código <strong className="mono">{productValue}</strong> não está cadastrado.
            Informe o nome para cadastrá-lo agora.
          </div>
          <div className="field">
            <label>Nome do produto</label>
            <input
              ref={productNameRef}
              value={productName}
              onChange={(e) => { setProductName(e.target.value); setError(null); }}
              placeholder="Ex.: Tinta Base A"
              disabled={loading}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" style={{ display: "none" }} />
        </form>
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
              onChange={(e) => { setValue(e.target.value); setError(null); setProductValue(null); }}
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
