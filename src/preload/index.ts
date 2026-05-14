import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type AppSettings,
  type BatchInput,
  type BatchWithFormula,
  type EquipmentUpdateInput,
  type FormulaInput,
  type LoginRequest,
  type LoginResult,
  type SerialPortInfo,
  type SerialReaderApi,
  type ServiceResult,
  type UserCreateInput
} from "../shared/ipc";
import type { Equipment, Formula, User } from "../shared/types";

const api: SerialReaderApi = {
  auth: {
    login: (req: LoginRequest): Promise<LoginResult> => ipcRenderer.invoke(IPC.authLogin, req),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.authLogout),
    currentUser: (): Promise<User | null> => ipcRenderer.invoke(IPC.authCurrentUser)
  },
  formulas: {
    list: (): Promise<Formula[]> => ipcRenderer.invoke(IPC.formulasList),
    create: (input: FormulaInput): Promise<ServiceResult<Formula>> =>
      ipcRenderer.invoke(IPC.formulasCreate, input),
    update: (id: number, input: FormulaInput): Promise<ServiceResult<Formula>> =>
      ipcRenderer.invoke(IPC.formulasUpdate, id, input),
    remove: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.formulasDelete, id)
  },
  batches: {
    listOpen: (): Promise<BatchWithFormula[]> => ipcRenderer.invoke(IPC.batchesListOpen),
    create: (input: BatchInput): Promise<ServiceResult<BatchWithFormula>> =>
      ipcRenderer.invoke(IPC.batchesCreate, input),
    close: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.batchesClose, id)
  },
  settings: {
    getAll: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGetAll),
    set: (key: string, value: string): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.settingsSet, key, value)
  },
  equipments: {
    list: (): Promise<Equipment[]> => ipcRenderer.invoke(IPC.equipmentsList),
    update: (id: number, patch: EquipmentUpdateInput): Promise<ServiceResult<Equipment>> =>
      ipcRenderer.invoke(IPC.equipmentsUpdate, id, patch)
  },
  users: {
    list: (): Promise<User[]> => ipcRenderer.invoke(IPC.usersList),
    create: (input: UserCreateInput): Promise<ServiceResult<User>> =>
      ipcRenderer.invoke(IPC.usersCreate, input),
    changePassword: (id: number, newPassword: string): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.usersChangePassword, id, newPassword),
    remove: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.usersDelete, id)
  },
  serial: {
    listPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke(IPC.serialListPorts)
  }
};

contextBridge.exposeInMainWorld("api", api);
