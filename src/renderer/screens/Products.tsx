import React, { useEffect, useState } from "react";
import type { Product } from "../../shared/types";
import { Modal } from "../components/Modal";

type EditState =
  | { mode: "create" }
  | { mode: "edit"; product: Product }
  | null;

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const list = await window.api.products.list();
    setProducts(list);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir o produto "${p.name}"?`)) return;
    const res = await window.api.products.remove(p.id);
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
        <button onClick={() => setEdit({ mode: "create" })}>+ Novo Produto</button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Criado em</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="muted">Carregando...</td></tr>
            )}
            {!loading && products.length === 0 && (
              <tr><td colSpan={4} className="muted">Nenhum produto cadastrado.</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td className="muted">{p.description ?? "—"}</td>
                <td className="muted mono" style={{ fontSize: 12 }}>{formatDate(p.createdAt)}</td>
                <td>
                  <button className="link" onClick={() => setEdit({ mode: "edit", product: p })}>Editar</button>
                  <button className="link danger" onClick={() => handleDelete(p)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <ProductFormModal
          initial={edit.mode === "edit" ? edit.product : null}
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
  initial: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProductFormModal({ initial, onClose, onSaved }: FormProps) {
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
      ? await window.api.products.update(initial.id, input)
      : await window.api.products.create(input);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      title={initial ? "Editar Produto" : "Novo Produto"}
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
