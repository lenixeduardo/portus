import { useEffect, useRef, useState } from "react";
import type { User } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";
import { canCaptureLaboratory, isLaboratoryUser } from "../../shared/laboratory-access";
import { isUserBarcode } from "../../shared/user-barcode";
import { CaptureModal } from "../components/CaptureModal";
import { EquipmentSelectionModal } from "../components/EquipmentSelectionModal";
import { BarcodeDisplay } from "../components/BarcodeDisplay";
import { BarcodeModal } from "../components/BarcodeModal";
import { Modal } from "../components/Modal";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import {
  filterAndSortActiveBatches,
  getProductFilterOptions,
  parseBatchDate,
  type BatchFilter,
  type BatchSortDirection
} from "./dashboard-filtering";
import "../active-batches-responsive.css";
import {
  CalendarDays,
  Circle,
  CircleCheck,
  ClipboardList,
  Copy,
  MoreVertical,
  Printer,
  ScanBarcode,
  UserRound,
  Zap
} from "lucide-react";

type ScannerState =
  | { phase: "idle" }
  | { phase: "detecting"; code: string }
  | { phase: "user"; name: string }
  | { phase: "error"; message: string };

/**
 * O executável pode ter sido atualizado enquanto o preload ainda é de uma
 * versão anterior. Nunca deixe essa incompatibilidade derrubar o dashboard:
 * ela deve aparecer como indisponibilidade da base, não como tela branca.
 */
function hasCentralBatchApi(): boolean {
  const api = window.api as Partial<typeof window.api> | undefined;
  return typeof api?.central?.status === "function"
    && typeof api.central.batches?.listOpen === "function";
}

function reportDashboardError(source: string, error: unknown): void {
  const api = window.api as Partial<typeof window.api> | undefined;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  void api?.log?.error(`renderer:dashboard:${source}`, message, stack).catch(() => {});
}

/** Renderização segura para nomes legados com acentos corrompidos (mojibake). */
export function formatRecentReadingEquipmentName(value: string): string {
  let name = value;
  if (/[ÃÂ][\u0080-\u00bf]|Ã[¡-¿]/.test(name)) {
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(
        Array.from(name, character => character.charCodeAt(0))
      ));
    } catch {
      // Dados já corrompidos permanecem exibíveis após o filtro abaixo.
    }
  }
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 .-]/g, "")
    .replace(/\s+/g, " ").trim() || "Equipamento";
}

export function Dashboard({
  user,
  onUnknownUserBarcode
}: {
  user: User;
  onUnknownUserBarcode: (barcode: string) => void;
}) {
  const [batches, setBatches] = useState<BatchWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [centralConfigured, setCentralConfigured] = useState(false);
  const [centralAvailable, setCentralAvailable] = useState(false);
  const [centralError, setCentralError] = useState<string | null>(null);
  const [centralRequired, setCentralRequired] = useState(true);
  const [centralStatusResolved, setCentralStatusResolved] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeInitial, setBarcodeInitial] = useState<string | undefined>(undefined);
  const [simulatingLot, setSimulatingLot] = useState(false);
  const [printBatch, setPrintBatch] = useState<BatchWithProduct | null>(null);
  const [captureBatchId, setCaptureBatchId] = useState<number | null>(null);
  const [captureEquipmentIds, setCaptureEquipmentIds] = useState<number[] | null>(null);
  const [simulatedCapture, setSimulatedCapture] = useState(false);
  const [selectionBatch, setSelectionBatch] = useState<BatchWithProduct | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<BatchWithProduct | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>({ phase: "idle" });
  const [batchFilter, setBatchFilter] = useState<BatchFilter>("ALL");
  const [productFilter, setProductFilter] = useState<"ALL" | string>("ALL");
  const [openedDateFilter, setOpenedDateFilter] = useState("");
  const [sortDirection, setSortDirection] = useState<BatchSortDirection>("DESC");
  const scannerIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLaboratory = isLaboratoryUser(user);
  const isAdmin = user.role === "admin" || user.role === "master";
  const isMaster = user.role === "master";
  const isSupervisor = user.role === "supervisor";
  const canFinalize = isSupervisor || isMaster;
  const canMarkCompleted = !isSupervisor;
  const canCapture = !isSupervisor && (!isLaboratory || canCaptureLaboratory(user));
  const requiresCentral = centralRequired || centralConfigured || isLaboratory;

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
      // IPC é uma fronteira externa: normalize a resposta antes de renderizar
      // filtros, contadores e cartões do lote.
      setBatches(Array.isArray(list) ? list : []);
      if (!Array.isArray(list)) {
        setScannerError("A base central retornou uma lista de lotes inválida.");
      }
    } catch (error) {
      setBatches([]);
      setScannerError("Não foi possível consultar os lotes na base central.");
      reportDashboardError("reload", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadCentralStatus() {
      if (!hasCentralBatchApi()) {
        setCentralConfigured(true);
        setCentralAvailable(false);
        setCentralRequired(true);
        setCentralStatusResolved(true);
        reportDashboardError("central-api", new Error("API central ausente ou incompatível no preload instalado."));
        return;
      }

      try {
        const status = await window.api.central.status();
        if (!status || typeof status !== "object") {
          throw new Error("Status da base central inválido.");
        }
        setCentralConfigured(Boolean(status.configured));
        setCentralAvailable(Boolean(status.available));
        setCentralError(status.error ?? null);
        setCentralRequired(Boolean(status.required));
      } catch (error) {
        setCentralConfigured(true);
        setCentralAvailable(false);
        setCentralError(error instanceof Error ? error.message : "PostgreSQL central indisponível.");
        setCentralRequired(true);
        reportDashboardError("central-status", error);
      } finally {
        setCentralStatusResolved(true);
      }
    }

    void loadCentralStatus();
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

  // O scanner prioriza etiquetas de usuário já cadastradas. Para leituras
  // desconhecidas, tenta primeiro encontrar um lote existente; somente depois
  // oferece cadastro de usuário para valores com formato de etiqueta textual.
  async function handleScan(code: string) {
    setScannerState({ phase: "detecting", code });

    try {
      const linkedUser = await window.api.users.findByBarcode(code);
      if (linkedUser) {
        setScannerState({
          phase: "user",
          name: linkedUser.displayName ?? linkedUser.username
        });
        clearScannerError();
        return;
      }

      if (requiresCentral) {
        if (!centralAvailable) {
          setScannerError("A base central está desconectada. A captura local foi bloqueada para proteger o lote.");
          return;
        }

        const centralBatch = await window.api.central.batches.findByCode(code);
        if (centralBatch) {
          setScannerState({ phase: "idle" });
          await handleBarcodeReady(centralBatch);
          return;
        }

        if (isUserBarcode(code)) {
          if (isAdmin) {
            setScannerState({ phase: "idle" });
            onUnknownUserBarcode(code);
          } else {
            setScannerError("Etiqueta de usuário não cadastrada. Solicite o cadastro a um Admin ou Master.");
          }
          return;
        }

        setScannerError("Lote não encontrado na base central. Crie o lote pelo fluxo central antes da captura.");
        return;
      }

      const existingBatch = await window.api.batches.findByCode(code);
      if (existingBatch) {
        setScannerState({ phase: "idle" });
        await handleBarcodeReady(existingBatch);
        return;
      }

      if (isUserBarcode(code)) {
        if (isAdmin) {
          setScannerState({ phase: "idle" });
          onUnknownUserBarcode(code);
        } else {
          setScannerError("Etiqueta de usuário não cadastrada. Solicite o cadastro a um Admin ou Master.");
        }
        return;
      }

      const res = await window.api.batches.scanBarcode({ barcodeValue: code });
      if (!res.ok) {
        setScannerError(res.error);
        return;
      }
      setScannerState({ phase: "idle" });
      await handleBarcodeReady(res.data.batch);
    } catch (error) {
      setScannerError("Não foi possível processar a leitura do código de barras.");
      reportDashboardError("scanner", error);
    }
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
      const equipments = (await window.api.equipments.list()).filter((equipment) => equipment.enabled);
      if (equipments.length === 0) {
        setScannerError("Nenhum equipamento habilitado para executar a simulação.");
        return;
      }
      await reload();
      setCaptureEquipmentIds(equipments.map((equipment) => equipment.id));
      setSimulatedCapture(true);
      setCaptureBatchId(res.data.id);
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
      ? await window.api.central.batches.finalize(b.id)
      : await window.api.batches.close(b.id);
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    await reload();
  }

  async function handleCompletedChange(batch: BatchWithProduct, completed: boolean) {
    if (!requiresCentral) return;
    const res = await window.api.central.batches.setCompleted(batch.id, completed);
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    setBatches((current) => current.map((item) => item.id === res.data.id ? res.data : item));
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

  async function handleStartCapture(batch: BatchWithProduct) {
    const already = await window.api.capture.isActive();
    if (already) {
      setScannerError("Já existe uma captura em andamento. Cancele antes de iniciar outra.");
      return;
    }
    setSelectionBatch(batch);
  }

  const productOptions = getProductFilterOptions(batches);
  const visibleBatches = filterAndSortActiveBatches(batches, {
    sector: batchFilter,
    productId: productFilter,
    openedOn: openedDateFilter,
    sortDirection
  });
  const inProgressCount = batches.filter((batch) => !batch.completed).length;
  const completedCount = batches.filter((batch) => batch.completed).length;
  const filtersActive = batchFilter !== "ALL"
    || productFilter !== "ALL"
    || openedDateFilter !== ""
    || sortDirection !== "DESC";

  function clearListFilters() {
    setBatchFilter("ALL");
    setProductFilter("ALL");
    setOpenedDateFilter("");
    setSortDirection("DESC");
  }

  return (
    <>
      <div className="dashboard-actions">
        {!isSupervisor && (
          <div className="dashboard-actions__buttons">
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
          </div>
        )}
      </div>

      {requiresCentral && !centralAvailable ? (
        <ScannerPanel state={{ phase: "error", message: centralError ?? "Base central indisponível — operações locais bloqueadas" }} />
      ) : canCapture ? (
        <ScannerPanel state={scannerState} />
      ) : (
        <ScannerPanel state={{ phase: "idle" }} message="Supervisor: revise o lote concluído para finalizar ou reabrir pelo Histórico." />
      )}

      {!loading && batches.length > 0 && (
        <div className="batch-list-controls" aria-label="Filtros de lote">
          <div className="batch-filter-tabs" role="tablist" aria-label="Filtrar lotes por setor">
            <FilterTab label="Todos" count={batches.length} active={batchFilter === "ALL"} onClick={() => setBatchFilter("ALL")} />
            <FilterTab label="Em andamento" count={inProgressCount} active={batchFilter === "IN_PROGRESS"} onClick={() => setBatchFilter("IN_PROGRESS")} />
            <FilterTab label="Concluídos" count={completedCount} active={batchFilter === "COMPLETED"} onClick={() => setBatchFilter("COMPLETED")} />
          </div>

          <div className="batch-list-filters">
            <div className="batch-list-filter batch-list-filter--product">
              <label htmlFor="batch-product-filter">Produto</label>
              <select
                id="batch-product-filter"
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value)}
                aria-label="Filtrar lotes por produto"
              >
                <option value="ALL">Todos os produtos</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </div>

            <div className="batch-list-filter batch-list-filter--date">
              <label htmlFor="batch-opened-date-filter">Data de abertura</label>
              <input
                id="batch-opened-date-filter"
                type="date"
                value={openedDateFilter}
                onChange={(event) => setOpenedDateFilter(event.target.value)}
                aria-label="Filtrar lotes por data de abertura"
              />
            </div>

            <div className="batch-list-filter batch-list-filter--sort">
              <label htmlFor="batch-sort-direction">Ordenação</label>
              <select
                id="batch-sort-direction"
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as BatchSortDirection)}
                aria-label="Ordenar lotes pela data de abertura"
              >
                <option value="DESC">Decrescente · mais recentes</option>
                <option value="ASC">Crescente · mais antigos</option>
              </select>
            </div>

            {filtersActive && (
              <button type="button" className="secondary batch-filter-clear" onClick={clearListFilters}>
                Limpar filtros
              </button>
            )}
          </div>

          <div className="batch-list-summary" aria-live="polite">
            {visibleBatches.length === batches.length
              ? `${batches.length} ${batches.length === 1 ? "lote ativo" : "lotes ativos"}`
              : `${visibleBatches.length} de ${batches.length} lotes`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="muted mono" style={{ fontSize: 12 }}>Carregando...</div>
      ) : batches.length === 0 ? (
        <div className="placeholder">
          {isLaboratory
            ? "Nenhum lote aguardando processamento do Laboratório."
            : "Nenhum lote aberto. Escaneie um código de barras para criar ou abrir um lote."}
        </div>
      ) : (
        <div className="batch-list">
          {visibleBatches.map((b) => (
            <BatchRow
              key={b.id}
              batch={b}
              isCapturing={captureBatchId === b.id}
              canFinalize={canFinalize && Boolean(b.completed)}
              canMarkCompleted={canMarkCompleted}
              centralMode={requiresCentral}
              canCapture={canCapture}
              onCompletedChange={(completed) => void handleCompletedChange(b, completed)}
              onClose={() => handleClose(b)}
              onCapture={() => void handleStartCapture(b)}
              onPrint={() => handlePrintBarcode(b)}
            />
          ))}
          {visibleBatches.length === 0 && <div className="placeholder">Nenhum lote corresponde aos filtros selecionados.</div>}
        </div>
      )}

      {showBarcode && (
        <BarcodeModal
          onClose={() => { setShowBarcode(false); setBarcodeInitial(undefined); }}
          onBatchReady={handleBarcodeReady}
          initialBarcode={barcodeInitial}
          centralMode={requiresCentral}
        />
      )}

      {printBatch && (
        <PrintBarcodeModal batch={printBatch} onClose={() => setPrintBatch(null)} />
      )}

      {confirmBatch && (
        <ConfirmCloseModal
          batch={confirmBatch}
          centralMode={requiresCentral}
          adminOverride={canFinalize}
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
          simulated={simulatedCapture}
          onClose={async () => {
            setCaptureBatchId(null);
            setCaptureEquipmentIds(null);
            setSimulatedCapture(false);
            await reload();
          }}
          onEnded={() => {
            setCaptureBatchId(null);
            setCaptureEquipmentIds(null);
            setSimulatedCapture(false);
            void reload();
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

function ScannerPanel({ state, message }: { state: ScannerState; message?: string }) {
  const content = state.phase === "error"
    ? { title: "Falha na leitura", description: state.message, tone: "error" }
    : state.phase === "detecting"
      ? { title: "Código identificado", description: `${state.code} — validando…`, tone: "detecting" }
      : state.phase === "user"
        ? { title: "Etiqueta de usuário", description: state.name, tone: "detecting" }
        : { title: "Pronto para leitura", description: message ?? "Aponte o leitor para um código de barras…", tone: "idle" };

  return (
    <section className={`scanner-panel scanner-panel--${content.tone}`} aria-live="polite">
      <div className="scanner-panel__copy">
        <ScanBarcode size={26} aria-hidden="true" />
        <div>
          <strong>{content.title}</strong>
          <span>{content.description}</span>
        </div>
      </div>
      <div className="scanner-panel__barcode" aria-hidden="true">
        <BarcodeDisplay value="PORTUS-SCANNER-READY" height={28} lineColor="#00d7b5" />
      </div>
    </section>
  );
}

function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`batch-filter-tab ${active ? "is-active" : ""}`} onClick={onClick} role="tab" aria-selected={active}>
      {label}<span>{count}</span>
    </button>
  );
}

function BatchRow({
  batch,
  isCapturing,
  canFinalize,
  canMarkCompleted,
  centralMode,
  canCapture,
  onCompletedChange,
  onClose,
  onCapture,
  onPrint
}: {
  batch: BatchWithProduct;
  isCapturing: boolean;
  canFinalize: boolean;
  canMarkCompleted: boolean;
  centralMode: boolean;
  canCapture: boolean;
  onCompletedChange: (completed: boolean) => void;
  onClose: () => void;
  onCapture: () => void;
  onPrint: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copiar código");

  async function copyBatchCode() {
    try {
      await navigator.clipboard.writeText(batch.code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = batch.code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopyLabel("Código copiado");
    setMenuOpen(false);
    window.setTimeout(() => setCopyLabel("Copiar código"), 2000);
  }

  return (
    <article className={`batch-row ${isCapturing ? "batch-row-capturing" : ""}`}>
      <section className="batch-row__identity">
        <div className="batch-row__title">
          <div>
            <div className="batch-code">#{batch.code}</div>
            <div className="batch-recipe">{batch.productName}</div>
          </div>
          <span className={`chip ${batch.completed ? "chip-blue" : "chip-green"}`}>
            {batch.completed ? "CONCLUÍDO" : "ABERTO"}
          </span>
        </div>
        <div className="batch-barcode">
          <BarcodeDisplay value={batch.code} height={36} displayValue />
        </div>
      </section>

      <section className="batch-row__operation">
        <MetaItem icon={CalendarDays} label="Abertura em" value={formatDate(batch.openedAt)} />
        <MetaItem icon={ClipboardList} label="Leituras" value={String(batch.readingsCount)} />
        <MetaItem icon={UserRound} label="Aberto por" value={batch.operatorName} />
        <div className="batch-stage">
          <span>Etapa atual</span>
          <strong>{getStageLabel(batch)}</strong>
        </div>

        {centralMode && batch.readingPreviews && batch.readingPreviews.length > 0 && (
          <div className="batch-row-readings" aria-label="Últimas leituras do lote">
            <span>Últimas leituras</span>
            <div>
              {batch.readingPreviews.slice(0, 3).map((reading, index) => (
                <small key={`${reading.sectorCode}-${reading.equipmentName}-${reading.capturedAt}-${index}`}>
                  {reading.sectorCode === "LABORATORY" ? "LAB" : "PROD"} · {formatRecentReadingEquipmentName(reading.equipmentName)} <strong>{reading.value}</strong>
                </small>
              ))}
            </div>
          </div>
        )}
      </section>

      {centralMode && (
        <section className="batch-confirmations" aria-label="Conclusão operacional do lote">
          <span className="batch-confirmations__label">Conclusão do lote</span>
          <label className={batch.completed ? "confirmation-row is-confirmed" : "confirmation-row is-pending"}>
            <input
              type="checkbox"
              checked={Boolean(batch.completed)}
              disabled={!canMarkCompleted}
              onChange={(event) => onCompletedChange(event.target.checked)}
            />
            <strong>Lote concluído</strong>
            <span>{batch.completed ? "aguardando finalização" : "em andamento"}</span>
          </label>
        </section>
      )}

      <div className="batch-row__actions">
        <button className="secondary" onClick={onPrint} title="Imprimir código de barras" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Printer size={13} />
          Imprimir
        </button>

        {canCapture && !batch.completed && (
          <button className="batch-finalize" onClick={onCapture} disabled={isCapturing} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ScanBarcode className="batch-finalize__icon" size={17} strokeWidth={1.8} aria-hidden="true" />
            {isCapturing ? "Leitura em andamento" : "Iniciar leitura"}
          </button>
        )}

        {canFinalize && (
          <button className="batch-finalize" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CircleCheck className="batch-finalize__icon" size={17} strokeWidth={1.8} aria-hidden="true" />
            Finalizar lote
          </button>
        )}

        <div className="batch-more-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }}>
          <button type="button" className="batch-more" aria-label={`Mais ações para o lote ${batch.code}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Mais ações" onClick={() => setMenuOpen((open) => !open)}>
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="batch-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={copyBatchCode}>
                <Copy size={14} aria-hidden="true" />
                {copyLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="batch-meta-item">
      <Icon size={17} aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ConfirmationRow({ label, confirmed }: { label: string; confirmed: boolean }) {
  const Icon = confirmed ? CircleCheck : Circle;
  return (
    <div className={confirmed ? "confirmation-row is-confirmed" : "confirmation-row is-pending"}>
      <Icon size={16} aria-hidden="true" />
      <strong>{label}</strong>
      <span>{confirmed ? "confirmado" : "pendente"}</span>
    </div>
  );
}

function getStageLabel(batch: BatchWithProduct): string {
  if (batch.status === "closed") return "Finalizado";
  if (batch.completed) return "Concluído";
  return "Em andamento";
}

function ConfirmCloseModal({
  batch,
  onClose,
  onConfirm
}: {
  batch: BatchWithProduct;
  centralMode: boolean;
  adminOverride: boolean;
  confirmationSector: "PRODUCTION" | "LABORATORY";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Finalizar lote"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={onConfirm}>Finalizar lote</button>
        </>
      }
    >
      <p>Finalizar o lote <strong>{batch.code}</strong>?</p>
      <p className="muted" style={{ fontSize: 13 }}>
        O lote já está marcado como concluído. A finalização será registrada no histórico e novas leituras exigirão reabertura por Supervisor ou Master.
      </p>
    </Modal>
  );
}

function formatDate(value: string | Date | null | undefined): string {
  const d = parseBatchDate(value);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
