import React, { useEffect, useState } from "react";

export function CaptureSettingsTab() {
  const [timeout, setTimeout_] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.settings.getAll().then((s) => {
      setTimeout_(s.capture_timeout_seconds ?? "30");
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await window.api.settings.set("capture_timeout_seconds", timeout);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
  }

  if (loading) return <div className="muted">Carregando...</div>;

  return (
    <div className="card" style={{ padding: 24, maxWidth: 480 }}>
      <div className="field">
        <label>Tempo de captura (segundos)</label>
        <input
          type="number"
          min={5}
          max={600}
          value={timeout}
          onChange={(e) => {
            setTimeout_(e.target.value);
            setSaved(false);
          }}
        />
        <small className="muted">
          Janela em que as portas seriais ficam abertas aguardando leituras (5 a 600s).
        </small>
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="success">Salvo com sucesso.</div>}

      <button onClick={save} disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
