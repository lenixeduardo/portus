import React, { useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import type { BarcodeScanResult, BatchWithProduct } from "../../shared/ipc";
import { Modal } from "./Modal";
import type { Product } from "../../shared/types";
import { scanBarcodeByMode } from "../services/barcode-scan";

interface Props {
  onClose: () => void;
  onBatchReady: (batch: BatchWithProduct) => void;
  initialBarcode?: string;
  centralMode?: boolean;
}

export function BarcodeModal({ onClose, onBatchReady, initialBarcode, centralMode = false }: Props) {
  const [value, setValue] = useState(initialBarcode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [lotCode, setLotCode] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (centralMode) {
      window.api.products.list().then((items) => {
        if (!mountedRef.current) return;
        setProducts(items);
        setProductId((current) => current ?? items[0]?.id ?? null);
      }).catch(() => {
        if (mountedRef.current) setError("Não foi possível carregar os produtos cadastrados.");
      });
    }
    if (initialBarcode) {
      scan(initialBarcode);
    } else {
      // window.focus() reacquires OS-level keyboard focus for the Electron window
      // in case it was lost during a logout/login cycle, then focuses the input.
      window.focus();
      inputRef.current?.focus();
    }
    return () => { mountedRef.current = false; };
  }, []);

  async function scan(barcode: string) {
    setLoading(true);
    setError(null);
    if (centralMode) {
      try {
        const original = barcode.trim();
        const existing = await window.api.central.batches.findByCode(original);
        if (!mountedRef.current) return;
        setLoading(false);
        if (existing) {
          setResult({ batch: existing, created: false });
          setPendingBarcode(null);
          return;
        }
        const suffix = original.slice(-4);
        if (!/^\d{4}$/.test(suffix)) {
          setError("O código lido deve terminar com quatro dígitos numéricos.");
          return;
        }
        setLotCode(suffix);
        setPendingBarcode(original);
        return;
      } catch {
        if (mountedRef.current) { setLoading(false); setError("Não foi possível verificar o lote no banco central."); }
        return;
      }
    }
    const res = await scanBarcodeByMode(window.api, barcode, centralMode, productId);
    if (!mountedRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      if (!initialBarcode) setValue("");
      return;
    }
    setResult(res.data);
  }

  async function createConfirmedBatch() {
    if (!pendingBarcode || loading) return;
    const code = lotCode.trim();
    if (!/^[0-9]{4}$/.test(code)) {
      setError("O número do lote deve conter exatamente quatro dígitos.");
      return;
    }
    if (productId === null) { setError("Selecione um produto."); return; }
    setLoading(true);
    setError(null);
    try {
      const existing = await window.api.central.batches.findByCode(code);
      if (!mountedRef.current) return;
      if (existing) { setError("O lote " + code + " já existe."); return; }
      const created = await window.api.central.batches.create({ productId, code });
      if (!mountedRef.current) return;
      if (!created.ok) { setError(created.error); return; }
      setPendingBarcode(null);
      setResult({ batch: created.data, created: true });
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
    await scan(barcode);
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
            <button onClick={() => void createConfirmedBatch()} disabled={loading || !/^[0-9]{4}$/.test(lotCode) || productId === null}>
              {loading ? "Criando..." : "Confirmar novo lote"}
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
      ) : pendingBarcode ? (
        <div>
          <p className="muted">Confira ou altere o número do lote antes de confirmar a criação.</p>
          <div className="field">
            <label htmlFor="lot-code">Número do lote (4 dígitos)</label>
            <input id="lot-code" className="mono" inputMode="numeric" maxLength={4} autoFocus
              value={lotCode} onChange={(event) => { setLotCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setError(null); }} />
            <small className="muted">Sugestão: os quatro últimos dígitos de {pendingBarcode}.</small>
          </div>
          <div className="field">
            <label>Produto</label>
            <select value={productId ?? ""} onChange={(event) => setProductId(Number(event.target.value))}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
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
          {centralMode && (
            <div className="field">
              <label>Produto do lote</label>
              <select
                value={productId ?? ""}
                onChange={(event) => setProductId(Number(event.target.value))}
                disabled={loading || products.length === 0}
              >
                {products.length === 0 && <option value="">Nenhum produto cadastrado</option>}
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <small className="muted">Usado somente quando o código ainda não possui um lote aberto.</small>
            </div>
          )}
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
