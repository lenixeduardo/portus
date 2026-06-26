import { useEffect, useState } from "react";
import type { Equipment } from "../../shared/types";
import type { BatchWithProduct } from "../../shared/ipc";
import { Modal } from "./Modal";

interface Props {
  batch: BatchWithProduct;
  onConfirm: (equipmentIds: number[]) => void;
  onCancel: () => void;
}

export function EquipmentSelectionModal({ batch, onConfirm, onCancel }: Props) {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.equipments.list().then((list) => {
      const enabled = list.filter((e) => e.enabled);
      setEquipments(enabled);
      setSelected(new Set(enabled.map((e) => e.id)));
      setLoading(false);
    });
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    onConfirm([...selected]);
  }

  return (
    <Modal
      title="Selecionar Equipamentos"
      onClose={onCancel}
      width={480}
      footer={
        <>
          <button className="secondary" onClick={onCancel}>Cancelar</button>
          <button onClick={handleConfirm} disabled={selected.size === 0 || loading}>
            Iniciar Captura
          </button>
        </>
      }
    >
      <div className="equipment-selection-batch">
        Lote: <strong>{batch.code}</strong>
        {batch.productName && batch.productName !== "—" && (
          <span className="muted"> — {batch.productName}</span>
        )}
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 16 }}>Carregando equipamentos...</div>
      ) : equipments.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 16 }}>Nenhum equipamento habilitado.</div>
      ) : (
        <ul className="equipment-selection-list">
          {equipments.map((eq) => (
            <li
              key={eq.id}
              className={`equipment-selection-item ${selected.has(eq.id) ? "equipment-selection-item-on" : ""}`}
              onClick={() => toggle(eq.id)}
            >
              <input
                type="checkbox"
                className="equipment-selection-checkbox"
                checked={selected.has(eq.id)}
                onChange={() => toggle(eq.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="equipment-selection-info">
                <span className="equipment-selection-name">{eq.name}</span>
                <span className="equipment-selection-meta muted">
                  Slot {eq.slotIndex}
                  {eq.portPath ? ` · ${eq.portPath}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && selected.size === 0 && (
        <p className="equipment-selection-warn">Selecione ao menos um equipamento.</p>
      )}
    </Modal>
  );
}
