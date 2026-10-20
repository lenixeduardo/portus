import React, { useState } from "react";
import { Database, ExternalLink } from "lucide-react";

export function DatabaseUtilityTab() {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function openUtility() {
    if (opening) return;
    setOpening(true);
    setError(null);
    setOpened(false);
    try {
      const result = await window.api.shell.openDbUtility();
      if (result.ok) {
        setOpened(true);
      } else {
        setError(result.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao solicitar a abertura do DB Utility.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="card" style={{ padding: 24, maxWidth: 580 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Database size={24} aria-hidden="true" />
        <h3 style={{ margin: 0 }}>PORTUS DB Utility</h3>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Abra o utilitário de manutenção do PostgreSQL em uma janela separada.
        Nele é possível validar a conexão, conferir o servidor e aplicar migrations.
      </p>
      <button type="button" onClick={() => { void openUtility(); }} disabled={opening}>
        <ExternalLink size={15} aria-hidden="true" style={{ marginRight: 8 }} />
        {opening ? "Abrindo DB Utility..." : "Abrir DB Utility"}
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        A abertura não executa migrations automaticamente. Para alterar o banco,
        confirme o servidor de destino, faça backup e informe a senha administrativa no utilitário.
      </p>
      {opened && <p className="success" role="status">Abertura solicitada. Se a janela não estiver visível, verifique o Alt+Tab.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
