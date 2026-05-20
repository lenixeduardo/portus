import type { Batch, Equipment, Product, User } from "./types";

export const IPC = {
  authLogin: "auth:login",
  authLogout: "auth:logout",
  authCurrentUser: "auth:current-user",
  productsList: "products:list",
  productsCreate: "products:create",
  productsUpdate: "products:update",
  productsDelete: "products:delete",
  batchesListOpen: "batches:list-open",
  batchesCreate: "batches:create",
  batchesClose: "batches:close",
  settingsGetAll: "settings:get-all",
  settingsSet: "settings:set",
  equipmentsList: "equipments:list",
  equipmentsUpdate: "equipments:update",
  usersList: "users:list",
  usersCreate: "users:create",
  usersChangePassword: "users:change-password",
  usersDelete: "users:delete",
  serialListPorts: "serial:list-ports",
  captureStart: "capture:start",
  captureCancel: "capture:cancel",
  captureIsActive: "capture:is-active",
  captureTick: "capture:tick",
  captureSlotUpdate: "capture:slot-update",
  captureEnded: "capture:ended",
  batchesListAll: "batches:list-all",
  batchesFindByCode: "batches:find-by-code",
  batchesScanBarcode: "batches:scan-barcode",
  historyGetBatch: "history:get-batch",
  historyExportCsv: "history:export-csv"
} as const;

export type SlotStatus = "idle" | "open" | "receiving" | "error";

export interface SlotInitState {
  slotIndex: number;
  equipmentId: number;
  name: string;
  status: SlotStatus;
}

export interface CaptureStartResult {
  sessionId: number;
  slots: SlotInitState[];
  timeoutSeconds: number;
}

export interface SlotUpdateEvent {
  slotIndex: number;
  status: SlotStatus;
  valueRaw?: string;
  valueParsed?: string;
  timestamp?: string;
}

export interface CaptureTickEvent {
  remaining: number;
  total: number;
}

export interface CaptureEndedEvent {
  reason: "completed" | "cancelled";
}

export type Unsubscribe = () => void;

export interface ReadingRecord {
  id: number;
  equipmentId: number;
  equipmentName: string;
  slotIndex: number;
  valueRaw: string;
  valueParsed?: string;
  capturedAt: string;
}

export interface CaptureSessionRecord {
  id: number;
  startedAt: string;
  endedAt?: string;
  timeoutSeconds: number;
  status: "active" | "completed" | "cancelled";
  readings: ReadingRecord[];
}

export interface BatchHistory {
  batch: BatchWithProduct;
  sessions: CaptureSessionRecord[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export interface ProductInput {
  name: string;
  description?: string;
}

export interface BatchInput {
  productId: number;
  code?: string;
}

export interface BatchWithProduct extends Batch {
  productName: string;
  operatorName: string;
  readingsCount: number;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  productId?: string;
  vendorId?: string;
}

export interface UserCreateInput {
  username: string;
  password: string;
  role?: "admin" | "operator";
}

export interface EquipmentUpdateInput {
  name?: string;
  portPath?: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  enabled?: boolean;
  parseRegex?: string;
}

export type AppSettings = Record<string, string>;

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface BarcodeScanInput {
  barcodeValue: string;
  productName?: string;
}

export interface BarcodeScanResult {
  batch: BatchWithProduct;
  created: boolean;
}

export type BarcodeScanResponse =
  | { ok: true; data: BarcodeScanResult }
  | { ok: false; error: string; productValue?: string };

export interface SerialReaderApi {
  auth: {
    login(req: LoginRequest): Promise<LoginResult>;
    logout(): Promise<void>;
    currentUser(): Promise<User | null>;
  };
  products: {
    list(): Promise<Product[]>;
    create(input: ProductInput): Promise<ServiceResult<Product>>;
    update(id: number, input: ProductInput): Promise<ServiceResult<Product>>;
    remove(id: number): Promise<ServiceResult<true>>;
  };
  batches: {
    listOpen(): Promise<BatchWithProduct[]>;
    listAll(): Promise<BatchWithProduct[]>;
    create(input: BatchInput): Promise<ServiceResult<BatchWithProduct>>;
    close(id: number): Promise<ServiceResult<true>>;
    findByCode(code: string): Promise<BatchWithProduct | null>;
    scanBarcode(input: BarcodeScanInput): Promise<BarcodeScanResponse>;
  };
  history: {
    getBatch(batchId: number): Promise<ServiceResult<BatchHistory>>;
    exportCsv(batchId: number): Promise<ServiceResult<true>>;
  };
  settings: {
    getAll(): Promise<AppSettings>;
    set(key: string, value: string): Promise<ServiceResult<true>>;
  };
  equipments: {
    list(): Promise<Equipment[]>;
    update(id: number, patch: EquipmentUpdateInput): Promise<ServiceResult<Equipment>>;
  };
  users: {
    list(): Promise<User[]>;
    create(input: UserCreateInput): Promise<ServiceResult<User>>;
    changePassword(id: number, newPassword: string): Promise<ServiceResult<true>>;
    remove(id: number): Promise<ServiceResult<true>>;
  };
  serial: {
    listPorts(): Promise<SerialPortInfo[]>;
  };
  capture: {
    start(batchId: number): Promise<ServiceResult<CaptureStartResult>>;
    cancel(): Promise<ServiceResult<true>>;
    isActive(): Promise<boolean>;
    onTick(cb: (e: CaptureTickEvent) => void): Unsubscribe;
    onSlotUpdate(cb: (e: SlotUpdateEvent) => void): Unsubscribe;
    onEnded(cb: (e: CaptureEndedEvent) => void): Unsubscribe;
  };
}

declare global {
  interface Window {
    api: SerialReaderApi;
  }
}
