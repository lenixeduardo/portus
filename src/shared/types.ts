export interface User {
  id: number;
  username: string;
  createdAt: string;
}

export interface Formula {
  id: number;
  name: string;
  description?: string;
  createdBy: number;
  createdAt: string;
}

export interface Batch {
  id: number;
  formulaId: number;
  code: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  createdBy: number;
}

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
