import React, { useEffect, useRef, useState } from "react";
import type { User } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";
import { CaptureModal } from "../components/CaptureModal";
import { BarcodeDisplay } from "../components/BarcodeDisplay";
import { BarcodeModal } from "../components/BarcodeModal";
import { Modal } from "../components/Modal";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { CheckSquare, Scan, Printer, ScanBarcode } from "lucide-react";

type ScannerState =
  | { phase: "idle" }
  | { phase: "detecting"; code: string }
  | { phase: "error"; message: string };

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeInitial, setBarcodeInitial] = useState<string | undefined>(undefined);
  const [printBatch, setPrintBatch] = useState<BatchWithProduct | null>(null);
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

  // Leitura pelo scanner físico é totalmente automática: processa o código,
  // cria/abre o lote e já inicia a captura, sem abrir modal nem exigir clique.
  // O modal segue disponível apenas para a entrada manual do código.
  async function handleScan(code: string) {
    setScannerState({ phase: "detecting", code });
    const res = await window.api.batches.scanBarcode({ barcodeValue: code });
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    setScannerState({ phase: "idle" });
    await handleBarcodeReady(res.data.batch);
  }

  useBarcodeScanner((code) => {
    handleScan(code);
  }, scannerActive);

  async function handleClose(b: BatchWithProduct) {
    if (!confirm(`Finalizar o lote ${b.code}?`)) return;
    const res = await window.api.batches.close(b.id);
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    await reload();
  }

  function handlePrintBarcode(batch: BatchWithProduct) {
    setPrintBatch(batch);
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
      </div>

      {loading ? (
        <div className="muted mono" style={{ fontSize: 12 }}>Carregando...</div>
      ) : batches.length === 0 ? (
        <div className="placeholder">
          Nenhum lote aberto. Escaneie um código de barras para criar ou abrir um lote.
        </div>
      ) : (
        <div className="batch-grid">
          {batches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              isCapturing={captureBatchId === b.id}
              canClose={true}
              onClose={() => handleClose(b)}
              onPrint={() => handlePrintBarcode(b)}
            />
          ))}
        </div>
      )}

      {showBarcode && (
        <BarcodeModal
          onClose={() => { setShowBarcode(false); setBarcodeInitial(undefined); }}
          onBatchReady={handleBarcodeReady}
          initialBarcode={barcodeInitial}
        />
      )}

      {printBatch && (
        <PrintBarcodeModal batch={printBatch} onClose={() => setPrintBatch(null)} />
      )}

      {captureBatchId !== null && (
        <CaptureModal
          batchId={captureBatchId}
          onClose={async () => {
            setCaptureBatchId(null);
            await reload();
          }}
          onEnded={reload}
        />
      )}
    </>
  );
}

function PrintBarcodeModal({ batch, onClose }: { batch: BatchWithProduct; onClose: () => void }) {
  function print() {
    document.body.classList.add("portus-printing");

    const cleanup = () => {
      document.body.classList.remove("portus-printing");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  }

  return (
    <Modal
      title="Imprimir código de barras"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={print} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Printer size={14} />
            Imprimir
          </button>
        </>
      }
    >
      <div className="print-sheet">
        {batch.productName && batch.productName !== "—" && (
          <div className="print-product">{batch.productName}</div>
        )}
        <BarcodeDisplay value={batch.code} height={60} displayValue lineColor="#111827" />
        <div className="print-label">LOTE</div>
        <div className="print-code">#{batch.code}</div>
      </div>
    </Modal>
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

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
