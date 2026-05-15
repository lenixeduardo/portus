import React, { useEffect, useRef, useState } from "react";
import type { CaptureStartResult, SlotInitState, SlotStatus, SlotUpdateEvent } from "../../shared/ipc";

interface SlotState extends SlotInitState {
  valueRaw?: string;
  valueParsed?: string;
  timestamp?: string;
}

interface Props {
  batchId: number;
  onClose: () => void;
  onEnded: () => void;
}

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function CaptureModal({ batchId, onClose, onEnded }: Props) {
  const [phase, setPhase] = useState<"starting" | "active" | "ended">("starting");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [endReason, setEndReason] = useState<"completed" | "cancelled" | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await window.api.capture.start(batchId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setPhase("ended");
        return;
      }

      const { slots: initSlots, timeoutSeconds } = res.data;
      setSlots(initSlots.map((s) => ({ ...s })));
      setRemaining(timeoutSeconds);
      setTotal(timeoutSeconds);
      setPhase("active");

      const unTick = window.api.capture.onTick((e) => {
        setRemaining(e.remaining);
        setTotal(e.total);
      });

      const unSlot = window.api.capture.onSlotUpdate((e: SlotUpdateEvent) => {
        setSlots((prev) =>
          prev.map((s) =>
            s.slotIndex === e.slotIndex
              ? {
                  ...s,
                  status: e.status,
                  valueRaw: e.valueRaw ?? s.valueRaw,
                  valueParsed: e.valueParsed ?? s.valueParsed,
                  timestamp: e.timestamp ?? s.timestamp
                }
              : s
          )
        );
      });

      const unEnded = window.api.capture.onEnded((e) => {
        setEndReason(e.reason);
        setPhase("ended");
        onEnded();
      });

      unsubsRef.current = [unTick, unSlot, unEnded];
    }

    init();

    return () => {
      cancelled = true;
      unsubsRef.current.forEach((fn) => fn());
      unsubsRef.current = [];
    };
  }, [batchId]);

  async function handleCancel() {
    await window.api.capture.cancel();
  }

  const progress = total > 0 ? remaining / total : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  const isStarting = phase === "starting";
  const isActive = phase === "active";

  return (
    <div className="modal-backdrop" onClick={undefined}>
      <div className="modal-card capture-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Captura em andamento</h3>
        </div>

        <div className="modal-body capture-modal-body">
          {error && <div className="error">{error}</div>}

          <div className="capture-countdown-wrap">
            <svg className="countdown-ring" viewBox="0 0 128 128" width="128" height="128">
              <circle
                cx="64" cy="64" r={RING_RADIUS}
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="10"
              />
              <circle
                cx="64" cy="64" r={RING_RADIUS}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={isStarting ? RING_CIRCUMFERENCE : dashOffset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "64px 64px", transition: "stroke-dashoffset 0.8s linear" }}
              />
              <text x="64" y="64" textAnchor="middle" dominantBaseline="central" className="countdown-text">
                {isStarting ? "..." : remaining}
              </text>
              <text x="64" y="80" textAnchor="middle" dominantBaseline="central" className="countdown-sub">
                {isStarting ? "" : "seg"}
              </text>
            </svg>
          </div>

          <div className="capture-grid">
            {slots.length === 0 && isStarting && (
              <div className="muted" style={{ gridColumn: "1/-1", textAlign: "center" }}>Abrindo portas...</div>
            )}
            {slots.map((slot) => (
              <CaptureSlot key={slot.slotIndex} slot={slot} />
            ))}
          </div>
        </div>

        <div className="modal-footer">
          {isActive && (
            <button className="secondary" onClick={handleCancel}>Cancelar Captura</button>
          )}
          {phase === "ended" && (
            <>
              {endReason === "completed" && (
                <span className="capture-status-msg capture-status-ok">Captura concluída</span>
              )}
              {endReason === "cancelled" && (
                <span className="capture-status-msg capture-status-warn">Captura cancelada</span>
              )}
              <button onClick={onClose}>Fechar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptureSlot({ slot }: { slot: SlotState }) {
  const ledClass = ledStatusClass(slot.status);
  const displayValue = slot.valueParsed ?? slot.valueRaw;
  const ts = slot.timestamp ? formatTime(slot.timestamp) : null;

  return (
    <div className={`capture-slot ${slot.status === "receiving" ? "capture-slot-active" : ""}`}>
      <div className="capture-slot-header">
        <span className={`led ${ledClass}`} title={ledLabel(slot.status)} />
        <span className="capture-slot-name">{slot.name}</span>
      </div>
      {displayValue ? (
        <div className="capture-slot-value mono">{displayValue}</div>
      ) : (
        <div className="capture-slot-empty">—</div>
      )}
      {ts && <div className="capture-slot-ts">{ts}</div>}
    </div>
  );
}

function ledStatusClass(status: SlotStatus): string {
  switch (status) {
    case "open": return "led-open";
    case "receiving": return "led-receiving";
    case "error": return "led-error";
    default: return "led-idle";
  }
}

function ledLabel(status: SlotStatus): string {
  switch (status) {
    case "open": return "Aguardando leitura";
    case "receiving": return "Leitura recebida";
    case "error": return "Erro na porta";
    default: return "Inativo";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR");
}
