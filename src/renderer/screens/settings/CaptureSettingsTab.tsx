import React, { useEffect, useState } from "react";

export function CaptureSettingsTab() {
  const [timeout, setTimeout_] = useState<string>("");
  const [barcodeRegex, setBarcodeRegex] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.settings.getAll().then((s) => {
      setTimeout_(s.capture_timeout_seconds ?? "30");
      setBarcodeRegex(s.barcode_regex ?? "");
      setLoading(false);
    });
  }, []);

  async function save() {
    if (barcodeRegex.trim()) {
      try {
        new RegExp(barcodeRegex.trim());
      } catch {
        setError("Regex de código de barras inválida.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const r1 = await window.api.settings.set("capture_timeout_seconds", timeout);
    if (!r1.ok) { setSaving(false); setError(r1.error); return; }
    const r2 = await window.api.settings.set("barcode_regex", barcodeRegex.trim());
    setSaving(false);
    if (!r2.ok) { setError(r2.error); return; }
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
          onChange={(e) => { setTimeout_(e.target.value); setSaved(false); }}
        />
        <small className="muted">
          Janela em que as portas seriais ficam abertas aguardando leituras (5 a 600s).
        </small>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label>Regex de código de barras (opcional)</label>
        <input
          value={barcodeRegex}
          onChange={(e) => { setBarcodeRegex(e.target.value); setSaved(false); }}
          placeholder="ex.: ^(?<formula>.+)\|(?<batch_code>.+)$"
          className="mono"
        />
        <small className="muted">
          Use grupos nomeados <code>{"(?<formula>...)"}</code> e <code>{"(?<batch_code>...)"}</code> para extrair
          a fórmula e o código do lote do código de barras.
          Se vazio, o código inteiro é tratado como código do lote.
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
