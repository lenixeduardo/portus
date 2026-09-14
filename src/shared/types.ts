export type UserSector = "PRODUCTION" | "LABORATORY";
export type LaboratoryProfile = "capture" | "closure";
export type UserRole = "master" | "admin" | "operator";

export interface User {
  id: number;
  username: string;
  displayName?: string;
  role: UserRole;
  sectorCode?: UserSector;
  laboratoryProfile?: LaboratoryProfile;
  createdAt: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  createdBy: number;
  createdAt: string;
}

export interface Batch {
  id: number;
  productId: number;
  code: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  closedBy?: number;
  createdBy: number;
  stage?: string;
  productionClosed?: boolean;
  laboratoryClosed?: boolean;
}

export type LineDelimiter = "crlf" | "lf" | "cr";

export type EquipmentProtocol = "passive" | "modbus_rtu";
export type ModbusFunction = 3 | 4;
export type ModbusRegisterDecode = "uint16" | "int16" | "uint32_be" | "uint32_le";

export interface Equipment {
  id: number;
  name: string;
  portPath: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  enabled: boolean;
  slotIndex: number;
  parseRegex?: string;
  lineDelimiter: LineDelimiter;
  skipFirstReading: boolean;
  stopAfterFirstReading: boolean;
  protocol: EquipmentProtocol;
  modbusUnitId: number;
  modbusFunction: ModbusFunction;
  modbusStartAddress: number;
  modbusQuantity: number;
  modbusRegisterDecode: ModbusRegisterDecode;
  modbusPollIntervalMs: number;
  modbusResponseTimeoutMs: number;
  scaleEnabled: boolean;
  scaleRawMin?: number;
  scaleRawMax?: number;
  scaleOutMin?: number;
  scaleOutMax?: number;
}

export interface Reading {
  id: number;
  batchId: number;
  equipmentId: number;
  valueRaw: string;
  valueParsed?: string;
  capturedAt: string;
  captureSessionId: number;
}

export interface CaptureSession {
  id: number;
  batchId: number;
  startedAt: string;
  endedAt?: string;
  timeoutSeconds: number;
  status: "active" | "completed" | "cancelled";
}
