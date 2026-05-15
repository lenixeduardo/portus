import React, { useEffect, useState } from "react";
import type { Formula } from "../../shared/types";
import { Modal } from "../components/Modal";

type EditState =
  | { mode: "create" }
  | { mode: "edit"; formula: Formula }
  | null;

export function Formulas() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const list = await window.api.formulas.list();
    setFormulas(list);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(f: Formula) {
    if (!confirm(`Excluir a fórmula "${f.name}"?`)) return;
    const res = await window.api.formulas.remove(f.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    reload();
  }

  return (
    <>
      <div className="page-actions">
        {error && <div className="alert">{error}</div>}
        <button onClick={() => setEdit({ mode: "create" })}>+ Nova Fórmula</button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Criada em</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="muted">Carregando...</td></tr>
            )}
            {!loading && formulas.length === 0 && (
              <tr><td colSpan={4} className="muted">Nenhuma fórmula cadastrada.</td></tr>
            )}
            {formulas.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.name}</strong></td>
                <td className="muted">{f.description ?? "—"}</td>
                <td className="muted mono" style={{ fontSize: 12 }}>{formatDate(f.createdAt)}</td>
                <td>
                  <button className="link" onClick={() => setEdit({ mode: "edit", formula: f })}>Editar</button>
                  <button className="link danger" onClick={() => handleDelete(f)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <FormulaFormModal
          initial={edit.mode === "edit" ? edit.formula : null}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setError(null);
            reload();
          }}
        />
      )}
    </>
  );
}

interface FormProps {
  initial: Formula | null;
  onClose: () => void;
  onSaved: () => void;
}

function FormulaFormModal({ initial, onClose, onSaved }: FormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input = { name, description };
    const res = initial
      ? await window.api.formulas.update(initial.id, input)
      : await window.api.formulas.create(input);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      title={initial ? "Editar Fórmula" : "Nova Fórmula"}
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
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Descrição</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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
