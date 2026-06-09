export type IndustrialDeviceType = "spectrometer" | "densimeter" | "viscometer";

export type IndustrialStatus =
  | "connected"
  | "waiting"
  | "offline"
  | "crc_error"
  | "timeout"
  | "port_unavailable"
  | "error";

export interface SerialConnectionConfig {
  portPath: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  timeoutMs: number;
  handshake?: "none" | "rtscts" | "xonxoff";
}

export interface IndustrialDeviceConfig {
  id: string;
  name: string;
  type: IndustrialDeviceType;
  unitId: number;
  serial: SerialConnectionConfig;
  registers: ModbusRegisterMap;
  pollIntervalMs: number;
}

export interface ModbusRegisterMap {
  startAddress: number;
  quantity: number;
  scale?: number;
  unit: string;
  metric: string;
}

export interface RawIndustrialPayload {
  deviceId: string;
  deviceType: IndustrialDeviceType;
  timestamp: string;
  registers: number[];
  rawFrame?: string;
}

export interface NormalizedIndustrialReading {
  device: string;
  timestamp: string;
  value: number;
  unit: string;
  status: IndustrialStatus;
  metric: string;
  raw?: RawIndustrialPayload;
}

export interface IndustrialLogEntry {
  timestamp: string;
  agent: string;
  deviceId?: string;
  level: "info" | "warn" | "error";
  message: string;
  payload?: unknown;
}

export interface DeviceDiagnostic {
  deviceId: string;
  status: IndustrialStatus;
  lastReadingAt?: string;
  lastResponseMs?: number;
  readingsCount: number;
  failuresCount: number;
  reconnectsCount: number;
  stabilityPercent: number;
}

export interface StreamTarget {
  id: string;
  type: "websocket" | "rest" | "event-bus";
  enabled: boolean;
}
