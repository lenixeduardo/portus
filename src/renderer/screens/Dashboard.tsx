import { useEffect, useRef, useState } from "react";
import type { User } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";
import { canCaptureLaboratory, canCloseLaboratory, isLaboratoryUser } from "../../shared/laboratory-access";
import { CaptureModal } from "../components/CaptureModal";
import { EquipmentSelectionModal } from "../components/EquipmentSelectionModal";
import { BarcodeDisplay } from "../components/BarcodeDisplay";
import { BarcodeModal } from "../components/BarcodeModal";
import { Modal } from "../components/Modal";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { CheckSquare, Scan, Printer, ScanBarcode, Zap } from "lucide-react";

type ScannerState =
  | { phase: "idle" }
  | { phase: "detecting"; code: string }
  | { phase: "error"; message: string };

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [centralConfigured, setCentralConfigured] = useState(false);
  const [centralAvailable, setCentralAvailable] = useState(false);
  const [centralStatusResolved, setCentralStatusResolved] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeInitial, setBarcodeInitial] = useState<string | undefined>(undefined);
  const [simulatingLot, setSimulatingLot] = useState(false);
  const [printBatch, setPrintBatch] = useState<BatchWithProduct | null>(null);
  const [captureBatchId, setCaptureBatchId] = useState<number | null>(null);
  const [captureEquipmentIds, setCaptureEquipmentIds] = useState<number[] | null>(null);
  const [selectionBatch, setSelectionBatch] = useState<BatchWithProduct | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<BatchWithProduct | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>({ phase: "idle" });
  const scannerIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLaboratory = isLaboratoryUser(user);
  const canCapture = !isLaboratory || canCaptureLaboratory(user);
  const requiresCentral = centralConfigured || isLaboratory;

  async function reload() {
    setLoading(true);
    try {
      if (requiresCentral && !centralAvailable) {
        setBatches([]);
        return;
      }
      const list = requiresCentral
        ? await window.api.central.batches.listOpen()
        : await window.api.batches.listOpen();
      setBatches(list);
    } catch {
      setBatches([]);
      setScannerError("Não foi possível consultar os lotes na base central.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    window.api.central.status().then((status) => {
      setCentralConfigured(status.configured);
      setCentralAvailable(status.available);
      setCentralStatusResolved(true);
    }).catch(() => {
      setCentralConfigured(true);
      setCentralAvailable(false);
      setCentralStatusResolved(true);
    });
  }, []);

  useEffect(() => {
    if (centralStatusResolved) reload();
  }, [centralAvailable, requiresCentral, centralStatusResolved]);

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

  // Auto-scanner disabled when BarcodeModal is open, capture is running, selection modal is open, or confirm dialog is visible
  const scannerActive = centralStatusResolved && canCapture && (!requiresCentral || centralAvailable) &&
    captureBatchId === null && !showBarcode && confirmBatch === null && selectionBatch === null;

  // Leitura pelo scanner físico é totalmente automática: processa o código,
  // cria/abre o lote e já inicia a captura, sem abrir modal nem exigir clique.
  // O modal segue disponível apenas para a entrada manual do código.
  async function handleScan(code: string) {
    setScannerState({ phase: "detecting", code });
    if (requiresCentral) {
      if (!centralAvailable) {
        setScannerError("A base central está desconectada. A captura local foi bloqueada para proteger o lote.");
        return;
      }
      const centralBatch = await window.api.central.batches.findByCode(code);
      if (!centralBatch) {
        setScannerError("Lote não encontrado na base central. Crie o lote pelo fluxo central antes da captura.");
        return;
      }
      setScannerState({ phase: "idle" });
      await handleBarcodeReady(centralBatch);
      return;
    }
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

  async function handleSimulateLot() {
    setSimulatingLot(true);
    try {
      const products = await window.api.products.list();
      if (products.length === 0) {
        setScannerError("Nenhum produto cadastrado. Cadastre um produto antes de simular.");
        return;
      }
      const product = products[0];
      const year = new Date().getFullYear();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      const code = `SIM-${year}-${rand}`;
      const res = requiresCentral
        ? await window.api.central.batches.create({ productId: product.id, code })
        : await window.api.batches.create({ productId: product.id, code });
      if (!res.ok) {
        setScannerError(res.error);
        return;
      }
      await handleBarcodeReady(res.data);
    } finally {
      setSimulatingLot(false);
    }
  }

  function handleClose(b: BatchWithProduct) {
    setConfirmBatch(b);
  }

  async function handleConfirmClose() {
    if (!confirmBatch) return;
    const b = confirmBatch;
    setConfirmBatch(null);
    const res = requiresCentral
      ? isLaboratory
        ? await window.api.central.batches.confirmLaboratory(b.id)
        : await window.api.central.batches.confirmProduction(b.id)
      : await window.api.batches.close(b.id);
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
      if (stillOpen) setSelectionBatch(batch);
      else setScannerError(`Lote ${batch.code} foi fechado antes de iniciar a captura.`);
      return current;
    });
  }

  function handleEquipmentSelected(ids: number[]) {
    const batch = selectionBatch;
    setSelectionBatch(null);
    setCaptureEquipmentIds(ids);
    if (batch) setCaptureBatchId(batch.id);
  }

  return (
    <>
      <div className="page-actions">
        {requiresCentral && centralAvailable && <div className="scanner-bar scanner-bar-idle">Base central conectada</div>}
        {requiresCentral && !centralAvailable && (
          <div className="scanner-bar scanner-bar-error">Base central indisponível — operações locais bloqueadas</div>
        )}
        {canCapture
          ? <ScannerStatusBar state={scannerState} />
          : <div className="scanner-bar scanner-bar-idle">Selecione um lote para revisar e confirmar o Laboratório.</div>}
        {!isLaboratory && (
          <>
            <button
              className="secondary"
              onClick={handleSimulateLot}
              disabled={!scannerActive || simulatingLot}
              title={scannerActive ? "Cria um lote com número randomizado para o primeiro produto cadastrado" : "Indisponível durante captura ou com modal aberto"}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Zap size={14} />
              {simulatingLot ? "Criando..." : "Simular Scan"}
            </button>
            <button
              className="secondary"
              onClick={() => openBarcodeModal()}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <ScanBarcode size={14} />
              Novo Lote por Código de Barras
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="muted mono" style={{ fontSize: 12 }}>Carregando...</div>
      ) : batches.length === 0 ? (
        <div className="placeholder">
          {isLaboratory
            ? "Nenhum lote aguardando processamento do Laboratório."
            : "Nenhum lote aberto. Escaneie um código de barras para criar ou abrir um lote."}
        </div>
      ) : (
        <div className="batch-grid">
          {batches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              isCapturing={captureBatchId === b.id}
              canClose={isLaboratory
                ? canCloseLaboratory(user) && !b.laboratoryClosed
                : !requiresCentral || !b.productionClosed}
              centralMode={requiresCentral}
              confirmationSector={isLaboratory ? "LABORATORY" : "PRODUCTION"}
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

      {confirmBatch && (
        <ConfirmCloseModal
          batch={confirmBatch}
          centralMode={requiresCentral}
          confirmationSector={isLaboratory ? "LABORATORY" : "PRODUCTION"}
          onClose={() => setConfirmBatch(null)}
          onConfirm={handleConfirmClose}
        />
      )}

      {selectionBatch !== null && (
        <EquipmentSelectionModal
          batch={selectionBatch}
          onConfirm={handleEquipmentSelected}
          onCancel={() => setSelectionBatch(null)}
        />
      )}

      {captureBatchId !== null && (
        <CaptureModal
          batchId={captureBatchId}
          equipmentIds={captureEquipmentIds ?? undefined}
          onClose={async () => {
            setCaptureBatchId(null);
            setCaptureEquipmentIds(null);
            await reload();
          }}
          onEnded={(reason) => {
            setCaptureBatchId(null);
            setCaptureEquipmentIds(null);
            if (reason === "completed") {
              // Defer logout to the next macrotask so React can unmount CaptureModal
              // (removing IPC listeners) before the logout IPC call starts.
              setTimeout(onLogout, 0);
            } else {
              reload();
            }
          }}
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
  centralMode,
  confirmationSector,
  onClose,
  onPrint
}: {
  batch: BatchWithProduct;
  isCapturing: boolean;
  canClose: boolean;
  centralMode: boolean;
  confirmationSector: "PRODUCTION" | "LABORATORY";
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

      {centralMode && (
        <div className="batch-confirmations" aria-label="Confirmações de fechamento">
          <span className={batch.productionClosed ? "is-confirmed" : "is-pending"}>
            Produção {batch.productionClosed ? "confirmada" : "pendente"}
          </span>
          <span className={batch.laboratoryClosed ? "is-confirmed" : "is-pending"}>
            Laboratório {batch.laboratoryClosed ? "confirmado" : "pendente"}
          </span>
        </div>
      )}

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
            className="batch-finalize"
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <CheckSquare size={13} />
            {centralMode
              ? confirmationSector === "LABORATORY" ? "Confirmar Laboratório" : "Confirmar Produção"
              : "Finalizar"}
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmCloseModal({
  batch,
  centralMode,
  confirmationSector,
  onClose,
  onConfirm
}: {
  batch: BatchWithProduct;
  centralMode: boolean;
  confirmationSector: "PRODUCTION" | "LABORATORY";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Finalizar Lote"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={onConfirm}>Finalizar</button>
        </>
      }
    >
      <p>{centralMode
        ? `Registrar confirmação do ${confirmationSector === "LABORATORY" ? "Laboratório" : "setor de Produção"} para o lote`
        : "Finalizar o lote"} <strong>{batch.code}</strong>?</p>
      <p className="muted" style={{ fontSize: 13 }}>
        {centralMode
          ? confirmationSector === "LABORATORY"
            ? batch.productionClosed
              ? "A Produção já confirmou. Esta ação concluirá o fechamento global do lote."
              : "O lote permanecerá aberto até a confirmação da Produção."
            : batch.laboratoryClosed
              ? "O Laboratório já confirmou. Esta ação concluirá o fechamento global do lote."
              : "O lote permanecerá aberto até a confirmação do Laboratório."
          : "Esta ação não pode ser desfeita."}
      </p>
    </Modal>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
