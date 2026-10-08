import React, { useState } from "react";
import { Download } from "lucide-react";
import type { AvailableUpdate } from "../../shared/ipc";
import { Modal } from "./Modal";

export function UpdateAvailableModal({ update, onClose }: { update: AvailableUpdate; onClose: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setOpening(true);
    setError(null);
    try {
      const result = await window.api.updates.download();
      if (result.ok) onClose();
      else setError(result.error);
    } catch {
      setError("Não foi possível abrir o download. Tente novamente.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <Modal title="Atualização disponível" onClose={onClose} width={520} footer={<>
      <button className="secondary" onClick={onClose}>Agora não</button>
      <button onClick={() => void download()} disabled={opening}><Download size={16} /> {opening ? "Abrindo download…" : "Baixar atualização"}</button>
    </>}>
      <p>Uma nova versão do PORTUS está disponível.</p>
      <p>Versão instalada: <strong>{update.currentVersion}</strong><br />Nova versão: <strong>{update.version}</strong></p>
      <p>O instalador será baixado pelo navegador. Conclua suas leituras e feche o PORTUS antes de instalá-lo.</p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
