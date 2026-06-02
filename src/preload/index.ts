import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type AppSettings,
  type BarcodeScanInput,
  type BarcodeScanResponse,
  type BatchHistory,
  type BatchInput,
  type BatchWithProduct,
  type CaptureEndedEvent,
  type CaptureStartResult,
  type CaptureStateSnapshot,
  type CaptureTickEvent,
  type EquipmentUpdateInput,
  type HistoryFilterInput,
  type ProductInput,
  type LoginRequest,
  type LoginResult,
  type SerialPortInfo,
  type SerialReaderApi,
  type ServiceResult,
  type SlotUpdateEvent,
  type Unsubscribe,
  type UserCreateInput
} from "../shared/ipc";
import type { Equipment, Product, User } from "../shared/types";

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
  products: {
    list: (): Promise<Product[]> => ipcRenderer.invoke(IPC.productsList),
    create: (input: ProductInput): Promise<ServiceResult<Product>> =>
      ipcRenderer.invoke(IPC.productsCreate, input),
    update: (id: number, input: ProductInput): Promise<ServiceResult<Product>> =>
      ipcRenderer.invoke(IPC.productsUpdate, id, input),
    remove: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.productsDelete, id)
  },
  batches: {
    listOpen: (): Promise<BatchWithProduct[]> => ipcRenderer.invoke(IPC.batchesListOpen),
    listAll: (): Promise<BatchWithProduct[]> => ipcRenderer.invoke(IPC.batchesListAll),
    create: (input: BatchInput): Promise<ServiceResult<BatchWithProduct>> =>
      ipcRenderer.invoke(IPC.batchesCreate, input),
    close: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.batchesClose, id),
    findByCode: (code: string): Promise<BatchWithProduct | null> =>
      ipcRenderer.invoke(IPC.batchesFindByCode, code),
    scanBarcode: (input: BarcodeScanInput): Promise<BarcodeScanResponse> =>
      ipcRenderer.invoke(IPC.batchesScanBarcode, input)
  },
  history: {
    getBatch: (batchId: number): Promise<ServiceResult<BatchHistory>> =>
      ipcRenderer.invoke(IPC.historyGetBatch, batchId),
    exportCsv: (batchId: number, filters?: HistoryFilterInput): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.historyExportCsv, batchId, filters)
  },
  settings: {
    getAll: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGetAll),
    set: (key: string, value: string): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.settingsSet, key, value),
    selectExportFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.settingsSelectExportFolder)
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
    getState: (): Promise<CaptureStateSnapshot> => ipcRenderer.invoke(IPC.captureGetState),
    onTick: (cb) => subscribe<CaptureTickEvent>(IPC.captureTick, cb),
    onSlotUpdate: (cb) => subscribe<SlotUpdateEvent>(IPC.captureSlotUpdate, cb),
    onEnded: (cb) => subscribe<CaptureEndedEvent>(IPC.captureEnded, cb)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.shellOpenExternal, url)
  }
};

contextBridge.exposeInMainWorld("api", api);
