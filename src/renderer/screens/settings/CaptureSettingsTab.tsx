import React, { useEffect, useState } from "react";

export function CaptureSettingsTab() {
  const [timeout, setTimeout_] = useState<string>("");
  const [barcodeRegex, setBarcodeRegex] = useState<string>("");
  const [exportFolder, setExportFolder] = useState<string>("");
  const [backupFolder, setBackupFolder] = useState<string>("");
  const [backupRetention, setBackupRetention] = useState<string>("10");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    window.api.settings.getAll().then((s) => {
      setTimeout_(s.capture_timeout_seconds ?? "30");
      setBarcodeRegex(s.barcode_regex ?? "");
      setExportFolder(s.auto_export_folder ?? "");
      setBackupFolder(s.auto_backup_folder ?? "");
      setBackupRetention(s.auto_backup_retention ?? "10");
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
    const retentionNum = Number(backupRetention);
    if (!Number.isInteger(retentionNum) || retentionNum < 1 || retentionNum > 100) {
      setError("Retenção de backups deve ser um inteiro entre 1 e 100.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const r1 = await window.api.settings.set("capture_timeout_seconds", timeout);
    if (!r1.ok) { setSaving(false); setError(r1.error); return; }
    const r2 = await window.api.settings.set("barcode_regex", barcodeRegex.trim());
    if (!r2.ok) { setSaving(false); setError(r2.error); return; }
    const r3 = await window.api.settings.set("auto_export_folder", exportFolder.trim());
    if (!r3.ok) { setSaving(false); setError(r3.error); return; }
    const r4 = await window.api.settings.set("auto_backup_folder", backupFolder.trim());
    if (!r4.ok) { setSaving(false); setError(r4.error); return; }
    const r5 = await window.api.settings.set("auto_backup_retention", String(retentionNum));
    if (!r5.ok) { setSaving(false); setError(r5.error); return; }
    setSaving(false);
    setSaved(true);
  }

  async function backupNow() {
    setBackingUp(true);
    setBackupMessage(null);
    setBackupError(null);
    const r = await window.api.settings.backupNow();
    setBackingUp(false);
    if (r.ok) {
      setBackupMessage(`Backup gerado em: ${r.data.path}`);
    } else {
      setBackupError(r.error);
    }
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

      <div className="field" style={{ marginTop: 28, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>
        <label>Backup automático do banco de dados</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            value={backupFolder}
            onChange={(e) => { setBackupFolder(e.target.value); setSaved(false); }}
            placeholder="Padrão: Documentos/PORTUS/backups"
            className="mono"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              const folder = await window.api.settings.selectBackupFolder();
              if (folder) { setBackupFolder(folder); setSaved(false); }
            }}
          >
            Selecionar
          </button>
        </div>
        <small className="muted">
          A cada 6 horas (e na inicialização) o banco de dados é copiado para esta pasta.
          Se vazio, usa a pasta padrão dentro de Documentos.
        </small>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Backups a manter (retenção)</label>
        <input
          type="number"
          min={1}
          max={100}
          value={backupRetention}
          onChange={(e) => { setBackupRetention(e.target.value); setSaved(false); }}
        />
        <small className="muted">
          Quantos arquivos de backup manter; os mais antigos são removidos (1 a 100).
        </small>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <button type="button" className="secondary" onClick={backupNow} disabled={backingUp}>
          {backingUp ? "Fazendo backup..." : "Fazer backup agora"}
        </button>
        {backupMessage && <div className="success" style={{ marginTop: 8 }}>{backupMessage}</div>}
        {backupError && <div className="error" style={{ marginTop: 8 }}>{backupError}</div>}
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="success">Salvo com sucesso.</div>}

      <button onClick={save} disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
