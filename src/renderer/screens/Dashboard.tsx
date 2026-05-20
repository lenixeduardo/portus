import React, { useEffect, useRef, useState } from "react";
import type { Product, User } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";
import { Modal } from "../components/Modal";
import { CaptureModal } from "../components/CaptureModal";
import { BarcodeDisplay } from "../components/BarcodeDisplay";
import { BarcodeModal } from "../components/BarcodeModal";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { CheckSquare, Scan, Printer, ScanBarcode } from "lucide-react";

type ScannerState =
  | { phase: "idle" }
  | { phase: "detecting"; code: string }
  | { phase: "error"; message: string };

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeInitial, setBarcodeInitial] = useState<string | undefined>(undefined);
  const [captureBatchId, setCaptureBatchId] = useState<number | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>({ phase: "idle" });
  const scannerIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function reload() {
    setLoading(true);
    const list = await window.api.batches.listOpen();
    setBatches(list);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  function clearScannerError() {
    if (scannerIdleTimer.current) clearTimeout(scannerIdleTimer.current);
    scannerIdleTimer.current = setTimeout(() => setScannerState({ phase: "idle" }), 4000);
  }

  function setScannerError(message: string) {
    setScannerState({ phase: "error", message });
    clearScannerError();
  }

  function openBarcodeModal(initial?: string) {
    setBarcodeInitial(initial);
    setShowBarcode(true);
  }

  // Auto-scanner disabled when BarcodeModal is open or capture is running
  const scannerActive = captureBatchId === null && !showBarcode;

  useBarcodeScanner((code) => {
    openBarcodeModal(code);
  }, scannerActive);

  async function handleClose(b: BatchWithProduct) {
    if (!confirm(`Finalizar o lote ${b.code}?`)) return;
    const res = await window.api.batches.close(b.id);
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    reload();
  }

  function handlePrintBarcode(batch: BatchWithProduct) {
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;
    win.document.write(`
      <html><head><title>Código de Barras — ${batch.code}</title>
      <style>
        body { font-family: monospace; background: #fff; color: #000; text-align: center; padding: 24px; }
        .label { font-size: 11px; color: #666; margin-bottom: 4px; }
        .code  { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
        .product { font-size: 12px; color: #444; }
        @media print { button { display: none; } }
      </style></head>
      <body>
        ${batch.productName && batch.productName !== "—" ? `<div class="product">${batch.productName}</div>` : ""}
        <canvas id="bc" style="max-width:280px;margin:12px auto;display:block"></canvas>
        <div class="label">LOTE</div>
        <div class="code">#${batch.code}</div>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"></script>
        <script>
          JsBarcode("#bc","${batch.code}",{format:"CODE128",height:60,displayValue:true,fontSize:12});
          window.onload = () => window.print();
        </script>
      </body></html>
    `);
    win.document.close();
  }

  async function handleBarcodeReady(batch: BatchWithProduct) {
    setShowBarcode(false);
    const already = await window.api.capture.isActive();
    if (already) {
      setScannerError("Já existe uma captura em andamento. Cancele antes de iniciar outra.");
      await reload();
      return;
    }
    await reload();
    setBatches((current) => {
      const stillOpen = current.some((b) => b.id === batch.id);
      if (stillOpen) setCaptureBatchId(batch.id);
      else setScannerError(`Lote ${batch.code} foi fechado antes de iniciar a captura.`);
      return current;
    });
  }

  return (
    <>
      <div className="page-actions">
        <ScannerStatusBar state={scannerState} />
        <button
          className="secondary"
          onClick={() => openBarcodeModal()}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <ScanBarcode size={14} />
          Novo Lote por Código de Barras
        </button>
        <button onClick={() => setShowNewBatch(true)}>+ Novo Lote</button>
      </div>

      {loading ? (
        <div className="muted mono" style={{ fontSize: 12 }}>Carregando...</div>
      ) : batches.length === 0 ? (
        <div className="placeholder">
          Nenhum lote aberto. Clique em <strong>+ Novo Lote</strong> para começar.
        </div>
      ) : (
        <div className="batch-grid">
          {batches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              isCapturing={captureBatchId === b.id}
              canClose={user.role === "admin"}
              onClose={() => handleClose(b)}
              onPrint={() => handlePrintBarcode(b)}
            />
          ))}
        </div>
      )}

      {showNewBatch && (
        <NewBatchModal
          onClose={() => setShowNewBatch(false)}
          onCreated={() => {
            setShowNewBatch(false);
            reload();
          }}
        />
      )}

      {showBarcode && (
        <BarcodeModal
          onClose={() => { setShowBarcode(false); setBarcodeInitial(undefined); }}
          onBatchReady={handleBarcodeReady}
          initialBarcode={barcodeInitial}
        />
      )}

      {captureBatchId !== null && (
        <CaptureModal
          batchId={captureBatchId}
          onClose={async () => {
            setCaptureBatchId(null);
            await window.api.auth.logout();
            onLogout();
          }}
          onEnded={reload}
        />
      )}
    </>
  );
}

function ScannerStatusBar({ state }: { state: ScannerState }) {
  if (state.phase === "error") {
    return (
      <div className="scanner-bar scanner-bar-error">
        <Scan size={14} />
        {state.message}
      </div>
    );
  }
  if (state.phase === "detecting") {
    return (
      <div className="scanner-bar scanner-bar-detecting">
        <Scan size={14} className="scanner-pulse" />
        Código detectado: <span className="mono">{state.code}</span> — validando…
      </div>
    );
  }
  return (
    <div className="scanner-bar scanner-bar-idle">
      <Scan size={14} />
      Aguardando leitura de código de barras…
    </div>
  );
}

function BatchCard({
  batch,
  isCapturing,
  canClose,
  onClose,
  onPrint
}: {
  batch: BatchWithProduct;
  isCapturing: boolean;
  canClose: boolean;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div className={`batch-card ${isCapturing ? "batch-card-capturing" : ""}`}>
      <div className="batch-card-head">
        <div>
          <div className="batch-code">#{batch.code}</div>
          <div className="batch-recipe">{batch.productName}</div>
        </div>
        <span className="chip chip-green">ABERTO</span>
      </div>

      <div className="batch-barcode">
        <BarcodeDisplay value={batch.code} height={42} />
      </div>

      <div className="batch-meta">
        <div>
          <span>Aberto</span>
          <strong>{formatDate(batch.openedAt)}</strong>
        </div>
        <div>
          <span>Leituras</span>
          <strong>{batch.readingsCount}</strong>
        </div>
        <div>
          <span>Operador</span>
          <strong>{batch.operatorName}</strong>
        </div>
      </div>

      <div className="batch-actions">
        <button
          className="secondary"
          onClick={onPrint}
          title="Imprimir código de barras"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Printer size={13} />
          Imprimir
        </button>
        {canClose && (
          <button
            className="secondary"
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <CheckSquare size={13} />
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
}

interface NewBatchProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewBatchModal({ onClose, onCreated }: NewBatchProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.products.list().then(setProducts);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError("Selecione um produto.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await window.api.batches.create({
      productId: Number(productId),
      code: code.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated();
  }

  return (
    <Modal
      title="Novo Lote"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={submit} disabled={saving}>
            {saving ? "Criando..." : "Criar Lote"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Produto</label>
          {products.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Cadastre um produto antes de criar um lote.</div>
          ) : (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Selecione...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label>Código do lote (opcional — gerado automaticamente)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ex.: 2026-0042"
            className="mono"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </Modal>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
