import React, { useEffect, useState } from "react";
import type { User } from "../../../shared/types";
import { Modal } from "../../components/Modal";

interface Props {
  currentUser: User;
}

type ModalState =
  | { mode: "create" }
  | { mode: "password"; user: User }
  | null;

export function UsersTab({ currentUser }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const list = await window.api.users.list();
    setUsers(list);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(u: User) {
    if (!confirm(`Excluir o usuário "${u.username}"?`)) return;
    const res = await window.api.users.remove(u.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    reload();
  }

  if (loading) return <div className="muted">Carregando...</div>;

  return (
    <>
      <div className="page-actions">
        {error && <div className="alert">{error}</div>}
        <button onClick={() => setModal({ mode: "create" })}>+ Novo Usuário</button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Criado em</th>
              <th style={{ width: 220 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                  {u.id === currentUser.id && (
                    <span className="chip chip-blue" style={{ marginLeft: 8 }}>VOCÊ</span>
                  )}
                </td>
                <td>
                  <span className={`chip ${u.sectorCode === "LABORATORY" ? "chip-laboratory" : u.role === "admin" || u.role === "master" ? "chip-blue" : "chip-green"}`}>
                    {formatAccessProfile(u)}
                  </span>
                </td>
                <td className="muted">{formatDate(u.createdAt)}</td>
                <td>
                  <button className="link" onClick={() => setModal({ mode: "password", user: u })}>
                    Alterar senha
                  </button>
                  {u.id !== currentUser.id && (
                    <button className="link danger" onClick={() => handleDelete(u)}>Excluir</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === "create" && (
        <CreateUserModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setError(null);
            reload();
          }}
          canCreateMaster={currentUser.role === "master"}
        />
      )}

      {modal?.mode === "password" && (
        <ChangePasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}

function CreateUserModal({ onClose, onSaved, canCreateMaster }: { onClose: () => void; onSaved: () => void; canCreateMaster: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accessProfile, setAccessProfile] = useState<"operator" | "admin" | "master" | "laboratory_capture">("operator");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const usernameError = getUsernameValidationError(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    const passwordError = getPasswordLengthError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setSaving(true);
    setError(null);
    const laboratory = accessProfile.startsWith("laboratory_");
    const res = await window.api.users.create({
      username,
      password,
      role: accessProfile === "master" ? "master" : accessProfile === "admin" ? "admin" : "operator",
      sectorCode: laboratory ? "LABORATORY" : "PRODUCTION",
      laboratoryProfile: laboratory ? "capture" : undefined
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      title="Novo Usuário"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={submit} disabled={saving}>
            {saving ? "Criando..." : "Criar"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Usuário</label>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            autoFocus
            required
            autoComplete="username"
            aria-invalid={username.length > 0 && Boolean(getUsernameValidationError(username))}
            aria-describedby="create-user-username-help"
          />
          <small
            id="create-user-username-help"
            className={username.length > 0 && getUsernameValidationError(username) ? "error" : "muted"}
          >
            {username.length > 0 && getUsernameValidationError(username)
              ? getUsernameValidationError(username)
              : "Use de 3 a 40 caracteres: letras sem acento, números, ponto (.), _ ou -. Não use espaços."}
          </small>
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            aria-invalid={password.length > 0 && password.length < 8}
            aria-describedby="create-user-password-help"
          />
          <small
            id="create-user-password-help"
            className={password.length > 0 && password.length < 8 ? "error" : "muted"}
          >
            {password.length > 0 && password.length < 8
              ? getPasswordLengthError(password)
              : "Use pelo menos 8 caracteres."}
          </small>
        </div>
        <div className="field">
          <label>Perfil</label>
          <select value={accessProfile} onChange={(e) => setAccessProfile(e.target.value as typeof accessProfile)}>
            <option value="operator">Operador — pode abrir lotes e realizar leituras</option>
            <option value="admin">Admin — acesso completo</option>
            {canCreateMaster && <option value="master">Master — acesso completo e reabertura de lotes</option>}
            <option value="laboratory_capture">Laboratório — captura e fechamento da etapa</option>
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </Modal>
  );
}

function ChangePasswordModal({
  user,
  onClose,
  onSaved
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = getPasswordLengthError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setSaving(true);
    setError(null);
    const res = await window.api.users.changePassword(user.id, password);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      title={`Alterar senha — ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Nova senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            minLength={8}
            required
            autoComplete="new-password"
            aria-invalid={password.length > 0 && password.length < 8}
            aria-describedby="change-password-help"
          />
          <small
            id="change-password-help"
            className={password.length > 0 && password.length < 8 ? "error" : "muted"}
          >
            {password.length > 0 && password.length < 8
              ? getPasswordLengthError(password)
              : "Use pelo menos 8 caracteres."}
          </small>
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </Modal>
  );
}

function getUsernameValidationError(username: string): string | null {
  if (username.length === 0) return "Informe um nome de usuário.";

  if (/\s/.test(username)) {
    return "O usuário não pode conter espaços. Use apenas letras sem acento, números, ponto (.), _ ou -.";
  }

  if (username.length < 3) {
    const missing = 3 - username.length;
    return `O usuário precisa ter pelo menos 3 caracteres. Faltam ${missing} ${missing === 1 ? "caractere" : "caracteres"}.`;
  }

  if (username.length > 40) {
    return `O usuário deve ter no máximo 40 caracteres. Remova ${username.length - 40} ${username.length - 40 === 1 ? "caractere" : "caracteres"}.`;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return "Formato de usuário inválido. Use apenas letras sem acento, números, ponto (.), _ ou -.";
  }

  return null;
}

function getPasswordLengthError(password: string): string | null {
  if (password.length >= 8) return null;
  if (password.length === 0) return "Informe uma senha com pelo menos 8 caracteres.";

  const missing = 8 - password.length;
  return `A senha precisa ter pelo menos 8 caracteres. Faltam ${missing} ${missing === 1 ? "caractere" : "caracteres"}.`;
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR");
}

function formatAccessProfile(user: User): string {
  if (user.role === "master") return "Master";
  if (user.sectorCode === "LABORATORY") {
    return "Laboratório · Captura";
  }
  return user.role === "admin" ? "Admin" : "Produção · Operador";
}
