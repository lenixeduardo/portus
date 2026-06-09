import { ipcMain } from "electron";
import { SerialPort } from "serialport";
import {
  IPC,
  type SerialPortInfo,
  type ServiceResult
} from "../../shared/ipc";
import type { Equipment } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import { getEquipment, listEquipments, updateEquipment } from "../db/equipments-repo";
import { updateEquipmentSchema, type UpdateEquipmentInput } from "../validation/schemas";
import { compose, requireAuth, validateInput } from "./middleware";

export function registerEquipmentsHandlers(): void {
  ipcMain.handle(IPC.equipmentsList, (): Equipment[] => listEquipments());

  ipcMain.handle(
    IPC.equipmentsUpdate,
    compose([requireAuth, validateInput(updateEquipmentSchema)])(
      (_e, input: UpdateEquipmentInput): ServiceResult<Equipment> => {
        if (!getEquipment(input.id)) return { ok: false, error: "Equipamento não encontrado." };
        const cleaned: typeof input = { ...input };
        if (input.name !== undefined) cleaned.name = input.name.trim();
        if (input.portPath !== undefined) cleaned.portPath = input.portPath.trim();
        if (input.parseRegex !== undefined) cleaned.parseRegex = input.parseRegex.trim() || undefined;
        const updated = updateEquipment(input.id, cleaned);
        return updated ? { ok: true, data: updated } : { ok: false, error: "Falha ao atualizar." };
      }
    )
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
