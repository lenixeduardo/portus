import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type AppSettings,
  type BatchHistory,
  type BatchInput,
  type BatchWithFormula,
  type CaptureEndedEvent,
  type CaptureStartResult,
  type CaptureTickEvent,
  type EquipmentUpdateInput,
  type FormulaInput,
  type LoginRequest,
  type LoginResult,
  type SerialPortInfo,
  type SerialReaderApi,
  type ServiceResult,
  type SlotUpdateEvent,
  type Unsubscribe,
  type UserCreateInput
} from "../shared/ipc";
import type { Equipment, Formula, User } from "../shared/types";

function subscribe<T>(channel: string, cb: (data: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

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
    listAll: (): Promise<BatchWithFormula[]> => ipcRenderer.invoke(IPC.batchesListAll),
    create: (input: BatchInput): Promise<ServiceResult<BatchWithFormula>> =>
      ipcRenderer.invoke(IPC.batchesCreate, input),
    close: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.batchesClose, id),
    findByCode: (code: string): Promise<BatchWithFormula | null> =>
      ipcRenderer.invoke(IPC.batchesFindByCode, code)
  },
  history: {
    getBatch: (batchId: number): Promise<ServiceResult<BatchHistory>> =>
      ipcRenderer.invoke(IPC.historyGetBatch, batchId),
    exportCsv: (batchId: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.historyExportCsv, batchId)
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
  },
  capture: {
    start: (batchId: number): Promise<ServiceResult<CaptureStartResult>> =>
      ipcRenderer.invoke(IPC.captureStart, batchId),
    cancel: (): Promise<ServiceResult<true>> => ipcRenderer.invoke(IPC.captureCancel),
    isActive: (): Promise<boolean> => ipcRenderer.invoke(IPC.captureIsActive),
    onTick: (cb) => subscribe<CaptureTickEvent>(IPC.captureTick, cb),
    onSlotUpdate: (cb) => subscribe<SlotUpdateEvent>(IPC.captureSlotUpdate, cb),
    onEnded: (cb) => subscribe<CaptureEndedEvent>(IPC.captureEnded, cb)
  }
};

contextBridge.exposeInMainWorld("api", api);
