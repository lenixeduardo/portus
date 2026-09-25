import React, { useCallback, useEffect, useState } from "react";
import type { BarcodeUserProfile } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { isUserBarcode, normalizeUserBarcode } from "../../shared/user-barcode";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import "../role-visibility.css";
import { Modal } from "./Modal";

interface Props {
  user: User;
  scannerEnabled?: boolean;
  requestedBarcode?: string | null;
  onRequestedBarcodeHandled?: () => void;
}

export function UserBarcodeRegistration({
  user,
  scannerEnabled = true,
  requestedBarcode = null,
  onRequestedBarcodeHandled
}: Props) {
  const allowed = user.role === "admin" || user.role === "master";
  const [pendingUserBarcode, setPendingUserBarcode] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<BarcodeUserProfile>("production");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.userRole = user.role;
    return () => {
      delete document.documentElement.dataset.userRole;
    };
  }, [user.role]);

  const handleBarcode = useCallback(async (code: string, external = false) => {
    const barcode = normalizeUserBarcode(code);
    if (!isUserBarcode(barcode) || pendingUserBarcode || saving) {
      if (external) onRequestedBarcodeHandled?.();
      return;
    }

    setError(null);

    try {
      const existing = await window.api.users.findByBarcode(barcode);
      if (existing) {
        setSuccess(`Etiqueta vinculada a ${existing.displayName ?? existing.username}.`);
        window.setTimeout(() => setSuccess(null), 3500);
        if (external) onRequestedBarcodeHandled?.();
        return;
      }

      setPendingUserBarcode(barcode);
      setDisplayName("");
      setPassword("");
      setProfile("production");
      if (!allowed) {
        setError("Usuário não cadastrado. Solicite o cadastro a um Admin ou Master.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a etiqueta.");
    } finally {
      if (external) onRequestedBarcodeHandled?.();
    }
  }, [allowed, onRequestedBarcodeHandled, pendingUserBarcode, saving]);

  useEffect(() => {
    if (!requestedBarcode || pendingUserBarcode) return;
    void handleBarcode(requestedBarcode, true);
  }, [handleBarcode, pendingUserBarcode, requestedBarcode]);

  useBarcodeScanner(
    (code) => {
      void handleBarcode(code);
    },
    scannerEnabled && !pendingUserBarcode,
    {
      capture: true,
      shouldIntercept: isUserBarcode
    }
  );

  function closeModal() {
    if (saving) return;
    setPendingUserBarcode(null);
    setDisplayName("");
    setPassword("");
    setError(null);
  }

  async function saveUser() {
    if (!pendingUserBarcode || !allowed) return;
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError("Informe o nome do usuário.");
      return;
    }
    if (password.length < 8) {
      setError("A senha manual deve ter ao menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await window.api.users.registerBarcode({
        barcode: pendingUserBarcode,
        displayName: cleanName,
        password,
        profile
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`Usuário ${result.data.username} cadastrado. A etiqueta já pode ser usada no login.`);
      setPendingUserBarcode(null);
      setDisplayName("");
      setPassword("");
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {success && (
        <div className="success" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000, margin: 0 }}>
          {success}
        </div>
      )}

      {pendingUserBarcode && (
        <Modal
          title={allowed ? "Cadastrar usuário por etiqueta" : "Etiqueta não cadastrada"}
          onClose={closeModal}
          width={520}
          footer={allowed ? (
            <>
              <button className="secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button onClick={saveUser} disabled={saving}>{saving ? "Salvando..." : "Cadastrar usuário"}</button>
            </>
          ) : (
            <button onClick={closeModal}>Fechar</button>
          )}
        >
          <div className="field">
            <label>Etiqueta</label>
            <input className="mono" value={pendingUserBarcode} readOnly />
            <small>Valor capturado automaticamente pelo leitor.</small>
          </div>

          {allowed ? (
            <>
              <div className="field">
                <label>Nome</label>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoFocus
                  placeholder="Nome do usuário"
                />
              </div>

              <div className="field">
                <label>Usuário</label>
                <input className="mono" value="Gerado automaticamente a partir do nome" readOnly />
                <small>Se já existir, o PORTUS adicionará 2, 3 e assim por diante.</small>
              </div>

              <div className="field">
                <label>Senha para login manual</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo de 8 caracteres"
                />
                <small>O código de barras é uma credencial separada e não será usado como senha.</small>
              </div>

              <div className="field">
                <label>Perfil</label>
                <select value={profile} onChange={(event) => setProfile(event.target.value as BarcodeUserProfile)}>
                  <option value="production">Produção</option>
                  <option value="laboratory_capture">Laboratório — Captura</option>
                  <option value="laboratory_closure">Laboratório — Fechamento</option>
                </select>
              </div>
            </>
          ) : (
            <p className="muted">
              Esta etiqueta ainda não está vinculada a um usuário. Somente Admin ou Master podem concluir o cadastro.
            </p>
          )}

          {error && <div className="error">{error}</div>}
        </Modal>
      )}
    </>
  );
}
