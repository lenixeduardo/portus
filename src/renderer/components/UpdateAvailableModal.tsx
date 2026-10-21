import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { AvailableUpdate, UpdateDownloadProgress } from "../../shared/ipc";
import { Modal } from "./Modal";

export function UpdateAvailableModal({ update, onClose }: { update: AvailableUpdate; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => window.api.updates.onProgress?.(setProgress), []);

  async function download() {
    setBusy(true); setError(null); setProgress(null);
    try {
      const result = await window.api.updates.download();
      if (result.ok) setDownloaded(true);
      else setError(result.error);
    } catch { setError("Não foi possível concluir o download. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function install() {
    setBusy(true); setError(null);
    try {
      const result = await window.api.updates.install();
      if (result.ok) setInstalling(true);
      else setError(result.error);
    } catch { setError("Não foi possível aplicar a atualização. Tente novamente."); }
    finally { setBusy(false); }
  }
  const percent = progress?.totalBytes ? Math.min(100, Math.floor(progress.receivedBytes / progress.totalBytes * 100)) : undefined;
  const close = () => { if (!busy && !installing) onClose(); };
  return (
    <Modal title="Atualização disponível" onClose={close} width={520} footer={<>
      <button className="secondary" onClick={close} disabled={busy || installing}>Agora não</button>
      {downloaded
        ? <button onClick={() => void install()} disabled={busy || installing}>{busy || installing ? "Preparando atualização…" : "Aplicar e reiniciar"}</button>
        : <button onClick={() => void download()} disabled={busy}><Download size={16} /> {busy ? "Baixando atualização…" : "Baixar atualização"}</button>}
    </>}>
      <p>Versão instalada: <strong>{update.currentVersion}</strong><br />Nova versão: <strong>{update.version}</strong></p>
      {!downloaded && <p>O PORTUS baixará os arquivos da nova versão e aplicará as mudanças na pasta atual.</p>}
      {busy && !downloaded && <div role="status" aria-live="polite">
        <progress aria-label="Download da atualização" max={100} value={percent} style={{ width: "100%" }} />
        <p>{percent === undefined ? "Baixando…" : `${percent}% baixado`}</p>
      </div>}
      {downloaded && <p role="status">Download concluído. Ao confirmar, o PORTUS será fechado e atualizado na pasta em que está instalado. Conclua suas leituras antes de continuar.</p>}
      {installing && <p role="status">Fechando o PORTUS para aplicar os arquivos da nova versão…</p>}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
