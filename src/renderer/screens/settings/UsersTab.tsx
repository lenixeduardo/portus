import React, { useEffect, useState } from "react";
import type { User } from "../../../shared/types";
import { Modal } from "../../components/Modal";

interface Props {
  currentUserId: number;
}

type ModalState =
  | { mode: "create" }
  | { mode: "password"; user: User }
  | null;

export function UsersTab({ currentUserId }: Props) {
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
              <th>Criado em</th>
              <th style={{ width: 220 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                  {u.id === currentUserId && (
                    <span className="chip chip-blue" style={{ marginLeft: 8 }}>VOCÊ</span>
                  )}
                </td>
                <td className="muted">{formatDate(u.createdAt)}</td>
                <td>
                  <button className="link" onClick={() => setModal({ mode: "password", user: u })}>
                    Alterar senha
                  </button>
                  {u.id !== currentUserId && (
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

function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await window.api.users.create({ username, password });
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
