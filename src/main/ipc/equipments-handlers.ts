import { ipcMain } from "electron";
import { SerialPort } from "serialport";
import {
  IPC,
  type EquipmentUpdateInput,
  type SerialPortInfo,
  type ServiceResult
} from "../../shared/ipc";
import type { Equipment } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import { getEquipment, listEquipments, updateEquipment } from "../db/equipments-repo";

const ALLOWED_BAUD = new Set([1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]);
const ALLOWED_PARITY = new Set(["none", "even", "odd"]);

function validate(patch: EquipmentUpdateInput): string | null {
  if (patch.name !== undefined && !patch.name.trim()) return "Nome obrigatório.";
  if (patch.baudRate !== undefined && !ALLOWED_BAUD.has(patch.baudRate)) {
    return "Baud rate inválido.";
  }
  if (patch.dataBits !== undefined && ![5, 6, 7, 8].includes(patch.dataBits)) {
    return "Data bits inválido.";
  }
  if (patch.stopBits !== undefined && ![1, 2].includes(patch.stopBits)) {
    return "Stop bits inválido.";
  }
  if (patch.parity !== undefined && !ALLOWED_PARITY.has(patch.parity)) {
    return "Paridade inválida.";
  }
  if (patch.parseRegex) {
    try {
      new RegExp(patch.parseRegex);
    } catch {
      return "Regex de parsing inválida.";
    }
  }
  return null;
}

export function registerEquipmentsHandlers(): void {
  ipcMain.handle(IPC.equipmentsList, (): Equipment[] => listEquipments());

  ipcMain.handle(
    IPC.equipmentsUpdate,
    (_e, id: number, patch: EquipmentUpdateInput): ServiceResult<Equipment> => {
      if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
      if (!getEquipment(id)) return { ok: false, error: "Equipamento não encontrado." };
      const err = validate(patch);
      if (err) return { ok: false, error: err };
      const cleaned: typeof patch = { ...patch };
      if (patch.name !== undefined) cleaned.name = patch.name.trim();
      if (patch.portPath !== undefined) cleaned.portPath = patch.portPath.trim();
      if (patch.parseRegex !== undefined) cleaned.parseRegex = patch.parseRegex.trim() || undefined;
      const updated = updateEquipment(id, cleaned);
      return updated ? { ok: true, data: updated } : { ok: false, error: "Falha ao atualizar." };
    }
  );

  ipcMain.handle(IPC.serialListPorts, async (): Promise<SerialPortInfo[]> => {
    try {
      const ports = await SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
        productId: p.productId,
        vendorId: p.vendorId
      }));
    } catch (e) {
      console.error("[serial] list-ports falhou:", e);
      return [];
    }
  });
}
