import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Send } from "lucide-react";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
}

type Phase = "form" | "sending" | "done";

export function ReportErrorModal({ onClose }: Props) {
  const [description, setDescription] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [resultMsg, setResultMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.log.getRecent().then(setLogs).catch(() => {});
  }, []);

  async function handleSend() {
    if (!description.trim()) {
      setError("Descreva o problema encontrado antes de enviar.");
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      const res = await window.api.log.sendReport({ description: description.trim() });
      if (!res.ok) {
        setError(res.error);
        setPhase("form");
        return;
      }
      const parts: string[] = [];
      if (res.data.sent) parts.push("relatório enviado ao servidor");
      if (res.data.filePath) parts.push("arquivo salvo na pasta de logs");
      setResultMsg(parts.length ? parts.join(" e ") + "." : "Relatório processado.");
      setPhase("done");
    } catch {
      setError("Erro inesperado ao enviar relatório.");
      setPhase("form");
    }
  }

  async function handleCopy() {
    const text = [
      "PORTUS — Relatório de Erro",
      `Timestamp: ${new Date().toISOString()}`,
      "",
      "Descrição:",
      description || "(sem descrição)",
      "",
      `--- Logs Recentes (${logs.length} entradas) ---`,
      ...logs.slice(-100)
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setResultMsg("Logs copiados para a área de transferência.");
      setPhase("done");
    } catch {
      setError("Não foi possível copiar para a área de transferência.");
    }
  }

  if (phase === "done") {
    return (
      <Modal
        title="Reportar Erro"
        onClose={onClose}
        width={480}
        footer={<button onClick={onClose}>Fechar</button>}
      >
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 12, color: "#10B981" }}>✓</div>
          <div>{resultMsg}</div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Reportar Erro"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button
            className="secondary"
            onClick={handleCopy}
            disabled={phase === "sending"}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <Copy size={13} />
            Copiar Logs
          </button>
          <button
            onClick={handleSend}
            disabled={phase === "sending" || !description.trim()}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <Send size={13} />
            {phase === "sending" ? "Enviando…" : "Enviar Relatório"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Descreva o problema encontrado</label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => { setDescription(e.target.value); setError(null); }}
          placeholder="Ex.: Ao iniciar a captura, o sistema exibiu erro na porta COM3…"
          style={{ width: "100%", resize: "vertical", minHeight: 80, boxSizing: "border-box" }}
          autoFocus
        />
      </div>

      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="secondary"
          onClick={() => setShowLogs((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          {showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {logs.length} entradas de log serão anexadas
        </button>
        {showLogs && (
          <pre
            style={{
              marginTop: 8,
              maxHeight: 180,
              overflow: "auto",
              fontSize: 10,
              background: "rgba(0,0,0,0.3)",
              padding: 8,
              borderRadius: 4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: "#94a3b8"
            }}
          >
            {logs.slice(-50).join("\n") || "(nenhum log registrado)"}
          </pre>
        )}
      </div>
    </Modal>
  );
}
