import React, { useEffect, useState } from "react";
import type { LaboratoryProfile, User, UserRole, UserSector } from "../../shared/types";
import { isUserBarcode } from "../../shared/user-barcode";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import "../role-visibility.css";
import { Modal } from "./Modal";

interface Props {
  user: User;
}

type Phase = "confirm" | "details";

export function UserBarcodeRegistration({ user }: Props) {
  const allowed = user.role === "admin" || user.role === "master";
  const [pendingUserBarcode, setPendingUserBarcode] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("confirm");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [sectorCode, setSectorCode] = useState<UserSector>("PRODUCTION");
  const [laboratoryProfile, setLaboratoryProfile] = useState<LaboratoryProfile>("capture");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.userRole = user.role;
    return () => {
      delete document.documentElement.dataset.userRole;
    };
  }, [user.role]);

  useBarcodeScanner(
    (code) => {
      if (!isUserBarcode(code) || pendingUserBarcode) return;
      setPendingUserBarcode(code.trim());
      setPhase("confirm");
      setDisplayName("");
      setRole("operator");
      setSectorCode("PRODUCTION");
      setLaboratoryProfile("capture");
      setError(null);
      setSuccess(null);
    },
    !pendingUserBarcode,
    {
      capture: true,
      shouldIntercept: isUserBarcode
    }
  );

  function closeModal() {
    if (saving) return;
    setPendingUserBarcode(null);
    setPhase("confirm");
    setError(null);
  }

  async function saveUser() {
    if (!pendingUserBarcode || !allowed) return;
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError("Informe o nome do usuário.");
      return;
    }

    setSaving(true);
    setError(null);
    const input = {
      username: pendingUserBarcode,
      password: pendingUserBarcode,
      displayName: cleanName,
      role,
      sectorCode,
      laboratoryProfile: sectorCode === "LABORATORY" ? laboratoryProfile : undefined
    };

    try {
      const result = await window.api.users.create(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`${result.data.displayName ?? cleanName} cadastrado com sucesso.`);
      setPendingUserBarcode(null);
      setPhase("confirm");
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  const footer = !allowed ? (
    <button onClick={closeModal}>Fechar</button>
  ) : phase === "confirm" ? (
    <>
      <button className="secondary" onClick={closeModal}>Não, cancelar</button>
      <button onClick={() => setPhase("details")}>Sim, é um usuário</button>
    </>
  ) : (
    <>
      <button className="secondary" onClick={() => setPhase("confirm")} disabled={saving}>Voltar</button>
      <button onClick={saveUser} disabled={saving}>{saving ? "Salvando..." : "Cadastrar usuário"}</button>
    </>
  );

  return (
    <>
      {success && (
        <div className="success" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000, margin: 0 }}>
          {success}
        </div>
      )}

      {pendingUserBarcode && (
        <Modal
          title="Etiqueta de usuário"
          onClose={closeModal}
          width={520}
          footer={footer}
        >
          {!allowed ? (
            <div>
              <p style={{ marginBottom: 12 }}>Este código de 16 dígitos foi identificado como uma etiqueta de usuário.</p>
              <div className="field">
                <label>Etiqueta</label>
                <input className="mono" value={pendingUserBarcode} readOnly />
              </div>
              <div className="error" style={{ marginBottom: 0 }}>
                Somente Admin ou Master podem cadastrar novos usuários por etiqueta.
              </div>
            </div>
          ) : phase === "confirm" ? (
            <div>
              <p style={{ marginBottom: 16 }}>Este código de 16 dígitos é uma etiqueta de usuário?</p>
              <div className="field">
                <label>Usuário / senha inicial</label>
                <input className="mono" value={pendingUserBarcode} readOnly />
                <small>Os 16 dígitos serão usados como usuário e senha inicial.</small>
              </div>
            </div>
          ) : (
            <div>
              <div className="field">
                <label>Nome</label>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus placeholder="Nome do usuário" />
              </div>

              <div className="field">
                <label>Usuário</label>
                <input className="mono" value={pendingUserBarcode} readOnly />
              </div>

              <div className="field">
                <label>Senha inicial</label>
                <input className="mono" value={pendingUserBarcode} readOnly />
              </div>

              <div className="field">
                <label>Perfil</label>
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                  <option value="operator">Operador</option>
                  <option value="admin">Admin</option>
                  {user.role === "master" && <option value="master">Master</option>}
                </select>
              </div>

              <div className="field">
                <label>Setor</label>
                <select value={sectorCode} onChange={(event) => setSectorCode(event.target.value as UserSector)}>
                  <option value="PRODUCTION">Produção</option>
                  <option value="LABORATORY">Laboratório</option>
                </select>
              </div>

              {sectorCode === "LABORATORY" && (
                <div className="field">
                  <label>Perfil do Laboratório</label>
                  <select value={laboratoryProfile} onChange={(event) => setLaboratoryProfile(event.target.value as LaboratoryProfile)}>
                    <option value="capture">Captura</option>
                    <option value="closure">Fechamento</option>
                  </select>
                </div>
              )}

              {error && <div className="error">{error}</div>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
