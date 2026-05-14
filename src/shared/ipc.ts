import type { Batch, Equipment, Formula, User } from "./types";

export const IPC = {
  authLogin: "auth:login",
  authLogout: "auth:logout",
  authCurrentUser: "auth:current-user",
  formulasList: "formulas:list",
  formulasCreate: "formulas:create",
  formulasUpdate: "formulas:update",
  formulasDelete: "formulas:delete",
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
  serialListPorts: "serial:list-ports"
} as const;

export interface LoginRequest {
  username: string;
  password: string;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export interface FormulaInput {
  name: string;
  description?: string;
}

export interface BatchInput {
  formulaId: number;
  code?: string;
}

export interface BatchWithFormula extends Batch {
  formulaName: string;
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

export interface SerialReaderApi {
  auth: {
    login(req: LoginRequest): Promise<LoginResult>;
    logout(): Promise<void>;
    currentUser(): Promise<User | null>;
  };
  formulas: {
    list(): Promise<Formula[]>;
    create(input: FormulaInput): Promise<ServiceResult<Formula>>;
    update(id: number, input: FormulaInput): Promise<ServiceResult<Formula>>;
    remove(id: number): Promise<ServiceResult<true>>;
  };
  batches: {
    listOpen(): Promise<BatchWithFormula[]>;
    create(input: BatchInput): Promise<ServiceResult<BatchWithFormula>>;
    close(id: number): Promise<ServiceResult<true>>;
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
}

declare global {
  interface Window {
    api: SerialReaderApi;
  }
}
