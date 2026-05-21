import React, { useEffect, useState } from "react";

export function CaptureSettingsTab() {
  const [timeout, setTimeout_] = useState<string>("");
  const [barcodeRegex, setBarcodeRegex] = useState<string>("");
  const [exportFolder, setExportFolder] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.settings.getAll().then((s) => {
      setTimeout_(s.capture_timeout_seconds ?? "30");
      setBarcodeRegex(s.barcode_regex ?? "");
      setExportFolder(s.auto_export_folder ?? "");
      setLoading(false);
    });
  }, []);

  async function save() {
    const timeoutNum = Number(timeout);
    if (!Number.isFinite(timeoutNum) || timeoutNum < 5 || timeoutNum > 600) {
      setError("Tempo de captura deve ser entre 5 e 600 segundos.");
      return;
    }
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
    if (!r2.ok) { setSaving(false); setError(r2.error); return; }
    if (exportFolder.trim()) {
      const r3 = await window.api.settings.set("auto_export_folder", exportFolder.trim());
      if (!r3.ok) { setSaving(false); setError(r3.error); return; }
    }
    setSaving(false);
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
          placeholder="ex.: ^(?<product>.+)\|(?<batch_code>.+)$"
          className="mono"
        />
        <small className="muted">
          Use grupos nomeados <code>{"(?<product>...)"}</code> e <code>{"(?<batch_code>...)"}</code> para extrair
          o produto e o código do lote do código de barras.
          Se vazio, o código inteiro é tratado como código do lote.
        </small>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label>Pasta de exportação automática</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={exportFolder}
            onChange={(e) => { setExportFolder(e.target.value); setSaved(false); }}
            placeholder="Padrão: Documentos/PORTUS/exportacoes"
            className="mono"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              const folder = await window.api.settings.selectExportFolder();
              if (folder) { setExportFolder(folder); setSaved(false); }
            }}
          >
            Selecionar
          </button>
        </div>
        <small className="muted">
          Todo dia à meia-noite, os lotes fechados são exportados automaticamente como CSV nesta pasta.
          Se vazio, usa a pasta padrão dentro de Documentos.
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
