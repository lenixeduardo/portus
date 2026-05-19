import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Formula } from "../../shared/types";
import type { BatchWithFormula } from "../../shared/ipc";
import { Modal } from "../components/Modal";
import { CaptureModal } from "../components/CaptureModal";
import { BarcodeDisplay } from "../components/BarcodeDisplay";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { CheckSquare, Scan, Printer } from "lucide-react";
import JsBarcode from "jsbarcode";

type ScannerState =
  | { phase: "idle" }
  | { phase: "detecting"; code: string }
  | { phase: "error"; message: string };

export function Dashboard() {
  const [batches, setBatches] = useState<BatchWithFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [captureBatchId, setCaptureBatchId] = useState<number | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>({ phase: "idle" });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function reload() {
    setLoading(true);
    const list = await window.api.batches.listOpen();
    setBatches(list);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  function scheduleIdleReturn() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setScannerState({ phase: "idle" }), 4000);
  }

  function setScannerError(message: string) {
    setScannerState({ phase: "error", message });
    scheduleIdleReturn();
  }

  const scannerActive = captureBatchId === null;

  useBarcodeScanner(async (code) => {
    if (captureBatchId !== null) return; // capture already running

    setScannerState({ phase: "detecting", code });

    const batch = await window.api.batches.findByCode(code);
    if (!batch) {
      setScannerError(`Código "${code}" não corresponde a nenhum lote aberto.`);
      return;
    }
    if (batch.status !== "open") {
      setScannerError(`Lote ${batch.code} já está finalizado.`);
      return;
    }

    const already = await window.api.capture.isActive();
    if (already) {
      setScannerError("Já existe uma captura em andamento. Aguarde ou cancele.");
      return;
    }

    setScannerState({ phase: "idle" });
    setCaptureBatchId(batch.id);
  }, scannerActive);

  async function handleClose(b: BatchWithFormula) {
    if (!confirm(`Finalizar o lote ${b.code}?`)) return;
    const res = await window.api.batches.close(b.id);
    if (!res.ok) {
      setScannerError(res.error);
      return;
    }
    reload();
  }

  const handlePrintBarcode = useCallback((batch: BatchWithFormula) => {
    // Generate barcode SVG in-process (no CDN, no XSS risk).
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, batch.code, {
        format: "CODE128",
        height: 60,
        displayValue: true,
        background: "#ffffff",
        lineColor: "#000000",
        fontSize: 12,
      });
    } catch {
      return;
    }
    const svgDataUrl = "data:image/svg+xml;base64," + btoa(new XMLSerializer().serializeToString(svg));

    const win = window.open("", "_blank", "width=420,height=320");
    if (!win) return;

    const doc = win.document;
    doc.title = `Código de Barras — ${batch.code}`;

    const style = doc.createElement("style");
    style.textContent = [
      "body{font-family:monospace;background:#fff;color:#000;text-align:center;padding:24px;margin:0}",
      ".label{font-size:11px;color:#666;margin-bottom:4px}",
      ".code{font-size:16px;font-weight:bold;margin-bottom:4px}",
      ".formula{font-size:12px;color:#444;margin-bottom:8px}",
      "img{max-width:280px;display:block;margin:0 auto}",
      "@media print{button{display:none}}",
    ].join("");
    doc.head.appendChild(style);

    const label = doc.createElement("div");
    label.className = "label";
    label.textContent = "LOTE";

    const code = doc.createElement("div");
    code.className = "code";
    code.textContent = `#${batch.code}`;

    const formula = doc.createElement("div");
    formula.className = "formula";
    formula.textContent = batch.formulaName;

    const img = doc.createElement("img");
    img.src = svgDataUrl;
    img.alt = batch.code;

    doc.body.appendChild(label);
    doc.body.appendChild(code);
    doc.body.appendChild(formula);
    doc.body.appendChild(img);

    win.onload = () => win.print();
    doc.close();
  }, []);

  return (
    <>
      <div className="page-actions">
        <ScannerStatusBar state={scannerState} />
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

      {captureBatchId !== null && (
        <CaptureModal
          batchId={captureBatchId}
          onClose={() => {
            setCaptureBatchId(null);
            reload();
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
  onClose,
  onPrint
}: {
  batch: BatchWithFormula;
  isCapturing: boolean;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div className={`batch-card ${isCapturing ? "batch-card-capturing" : ""}`}>
      <div className="batch-card-head">
        <div>
          <div className="batch-code">#{batch.code}</div>
          <div className="batch-recipe">{batch.formulaName}</div>
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
        <button
          className="secondary"
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <CheckSquare size={13} />
          Finalizar
        </button>
      </div>
    </div>
  );
}

interface NewBatchProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewBatchModal({ onClose, onCreated }: NewBatchProps) {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [formulaId, setFormulaId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.formulas.list().then(setFormulas);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formulaId) {
      setError("Selecione uma fórmula.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await window.api.batches.create({
      formulaId: Number(formulaId),
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
          <label>Fórmula</label>
          {formulas.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Cadastre uma fórmula antes de criar um lote.</div>
          ) : (
            <select
              value={formulaId}
              onChange={(e) => setFormulaId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Selecione...</option>
              {formulas.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
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
