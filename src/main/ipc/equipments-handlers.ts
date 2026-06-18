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
import { compose, requireAdmin, requireAuth, validateInput } from "./middleware";

export function registerEquipmentsHandlers(): void {
  ipcMain.handle(
    IPC.equipmentsList,
    compose([requireAuth])((): Equipment[] => listEquipments())
  );

  ipcMain.handle(
    IPC.equipmentsUpdate,
    compose([requireAdmin, validateInput(updateEquipmentSchema)])(
      (_e, input: UpdateEquipmentInput): ServiceResult<Equipment> => {
        if (!getEquipment(input.id)) return { ok: false, error: "Equipamento não encontrado." };
        const cleaned: Record<string, any> = { id: input.id };
        if (input.name !== undefined) cleaned.name = input.name.trim();
        if (input.portPath !== undefined) cleaned.portPath = input.portPath.trim();
        if (input.parseRegex !== undefined) cleaned.parseRegex = input.parseRegex.trim() || undefined;
        if (input.baudRate !== undefined) cleaned.baudRate = input.baudRate;
        if (input.dataBits !== undefined) cleaned.dataBits = input.dataBits;
        if (input.stopBits !== undefined) cleaned.stopBits = input.stopBits;
        if (input.parity !== undefined) cleaned.parity = input.parity;
        if (input.enabled !== undefined) cleaned.enabled = input.enabled;
        if (input.lineDelimiter !== undefined) cleaned.lineDelimiter = input.lineDelimiter;
        if (input.skipFirstReading !== undefined) cleaned.skipFirstReading = input.skipFirstReading;
        if (input.stopAfterFirstReading !== undefined) cleaned.stopAfterFirstReading = input.stopAfterFirstReading;
        if (input.protocol !== undefined) cleaned.protocol = input.protocol;
        if (input.modbusUnitId !== undefined) cleaned.modbusUnitId = input.modbusUnitId;
        if (input.modbusFunction !== undefined) cleaned.modbusFunction = input.modbusFunction;
        if (input.modbusStartAddress !== undefined) cleaned.modbusStartAddress = input.modbusStartAddress;
        if (input.modbusQuantity !== undefined) cleaned.modbusQuantity = input.modbusQuantity;
        if (input.modbusRegisterDecode !== undefined) cleaned.modbusRegisterDecode = input.modbusRegisterDecode;
        if (input.modbusPollIntervalMs !== undefined) cleaned.modbusPollIntervalMs = input.modbusPollIntervalMs;
        if (input.modbusResponseTimeoutMs !== undefined) cleaned.modbusResponseTimeoutMs = input.modbusResponseTimeoutMs;
        if (input.scaleEnabled !== undefined) cleaned.scaleEnabled = input.scaleEnabled;
        if (input.scaleRawMin !== undefined) cleaned.scaleRawMin = input.scaleRawMin;
        if (input.scaleRawMax !== undefined) cleaned.scaleRawMax = input.scaleRawMax;
        if (input.scaleOutMin !== undefined) cleaned.scaleOutMin = input.scaleOutMin;
        if (input.scaleOutMax !== undefined) cleaned.scaleOutMax = input.scaleOutMax;
        const updated = updateEquipment(input.id, cleaned);
        return updated ? { ok: true, data: updated } : { ok: false, error: "Falha ao atualizar." };
      }
    )
  );

  ipcMain.handle(
    IPC.serialListPorts,
    compose([requireAuth])(async (): Promise<SerialPortInfo[]> => {
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
    })
  );
}
