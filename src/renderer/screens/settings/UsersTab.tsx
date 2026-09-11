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
  const [accessProfile, setAccessProfile] = useState<"operator" | "admin" | "master" | "laboratory_capture" | "laboratory_closure">("operator");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const laboratory = accessProfile.startsWith("laboratory_");
    const res = await window.api.users.create({
      username,
      password,
      role: accessProfile === "master" ? "master" : accessProfile === "admin" ? "admin" : "operator",
      sectorCode: laboratory ? "LABORATORY" : "PRODUCTION",
      laboratoryProfile: laboratory
        ? accessProfile === "laboratory_capture" ? "capture" : "closure"
        : undefined
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
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Perfil</label>
          <select value={accessProfile} onChange={(e) => setAccessProfile(e.target.value as typeof accessProfile)}>
            <option value="operator">Operador — pode abrir lotes e realizar leituras</option>
            <option value="admin">Admin — acesso completo</option>
            {canCreateMaster && <option value="master">Master — acesso completo e reabertura de lotes</option>}
            <option value="laboratory_capture">Laboratório · Captura — consulta lotes e realiza leituras</option>
            <option value="laboratory_closure">Laboratório · Fechamento — revisa e confirma o lote</option>
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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </Modal>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR");
}

function formatAccessProfile(user: User): string {
  if (user.role === "master") return "Master";
  if (user.sectorCode === "LABORATORY") {
    return user.laboratoryProfile === "closure" ? "Laboratório · Fechamento" : "Laboratório · Captura";
  }
  return user.role === "admin" ? "Admin" : "Produção · Operador";
}
