export interface User {
  id: number;
  username: string;
  role: "admin" | "operator";
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
}

export type LineDelimiter = "crlf" | "lf" | "cr";

// Protocolo de aquisição do equipamento:
// - "passive": modelo atual; o equipamento envia ao apertar PRINT e o app escuta.
// - "modbus_rtu": modelo mestre/ativo; o app envia a requisição e lê a resposta.
export type EquipmentProtocol = "passive" | "modbus_rtu";

// Função Modbus de leitura: 3 = Read Holding Registers, 4 = Read Input Registers.
export type ModbusFunction = 3 | 4;

// Como interpretar os registradores (16 bits cada) retornados em um número:
// uint16/int16 usam apenas o primeiro registrador; uint32_* combinam dois.
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
  // Linearização (regra de três) aplicada ao valor decodificado/parseado.
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
