import type { ServiceResult } from "./ipc";

export type LaboratoryId = number | string;

export interface LaboratoryAnalysisInput {
  analysisId: LaboratoryId;
}

export interface LaboratoryStartInput {
  batchId: LaboratoryId;
  specificationId: LaboratoryId;
}

export interface LaboratorySampleInput extends LaboratoryAnalysisInput {
  identification: string;
}

interface LaboratoryMeasurementInput extends LaboratoryAnalysisInput {
  sampleId: LaboratoryId;
  parameterId: LaboratoryId;
  reason?: string;
}

export type LaboratoryResultInput = LaboratoryMeasurementInput & {
  readingId?: LaboratoryId;
} & (
  | { numericValue: string; unit: string; qualitativeValue?: never }
  | { qualitativeValue: string; numericValue?: never; unit?: never }
);

export interface LaboratoryCalculationInput extends LaboratoryMeasurementInput {
  formulaCode: string;
  formulaVersion: number;
  inputs: Record<string, { value: string; unit: string }>;
}

export interface LaboratoryDecisionInput {
  evaluationId: LaboratoryId;
  decision: "approved" | "rejected";
  reason: string;
}

export type LaboratoryOutcome = "conforming" | "nonconforming" | "incomplete";

export interface LaboratorySpecification {
  id: string;
  modelCode: string;
  version: number;
}

export interface LaboratoryAnalysis {
  id: string;
  cycle: string;
  revision: number;
  createdAt: string;
  createdBy: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
}

export interface LaboratoryParameter {
  id: string;
  name: string;
  valueType: "quantitative" | "qualitative";
  origin: "manual" | "instrumental" | "calculated" | null;
  unit: string | null;
  required: boolean | null;
  equipmentId: string | null;
  minimum: string | null;
  maximum: string | null;
  minimumInclusive: boolean | null;
  maximumInclusive: boolean | null;
  qualitativeValue: string | null;
  formula: {
    code: string;
    version: number;
    inputs: Array<{ cell: string; unit: string; description: string }>;
  } | null;
}

export interface LaboratoryResult {
  id: string | null;
  sampleId: string;
  parameterId: string;
  numericValue: string | null;
  qualitativeValue: string | null;
  unit: string | null;
  readingId: string | null;
  revision: number | null;
  outcome: LaboratoryOutcome | "not_applicable";
  invalidatedAt: string | null;
}

export interface LaboratoryReading {
  id: string;
  equipmentId: string;
  equipmentName: string;
  value: string;
  capturedAt: string;
}

export interface LaboratoryEvaluation {
  id: string;
  outcome: LaboratoryOutcome;
  decision: LaboratoryDecisionInput["decision"] | null;
  stale: boolean;
  assessedBy: string;
  assessedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
}

export interface LaboratoryHistoryEntry {
  id: string;
  kind: "analysis" | "result" | "evaluation" | "decision";
  cycle: string;
  analysisRevision: number;
  createdAt: string;
  actor: string;
  label: string;
  detail: string | null;
}

export interface LaboratoryBatchView {
  cycle: string;
  specification: LaboratorySpecification | null;
  analysisSpecification: LaboratorySpecification | null;
  analysis: LaboratoryAnalysis | null;
  outcome: LaboratoryOutcome | null;
  permissions: {
    canStart: boolean;
    canCapture: boolean;
    canSubmit: boolean;
    canApprove: boolean;
    canReject: boolean;
  };
  parameters: LaboratoryParameter[];
  samples: Array<{ id: string; identification: string }>;
  results: LaboratoryResult[];
  readings: LaboratoryReading[];
  evaluation: LaboratoryEvaluation | null;
  history: LaboratoryHistoryEntry[];
}

export interface LaboratoryApi {
  getBatch(input: { batchId: LaboratoryId }): Promise<ServiceResult<LaboratoryBatchView>>;
  startAnalysis(input: LaboratoryStartInput): Promise<ServiceResult<string>>;
  addSample(input: LaboratorySampleInput): Promise<ServiceResult<string>>;
  recordResult(input: LaboratoryResultInput): Promise<ServiceResult<string>>;
  recordCalculation(input: LaboratoryCalculationInput): Promise<ServiceResult<string>>;
  submitReview(input: LaboratoryAnalysisInput): Promise<ServiceResult<string>>;
  decideReview(input: LaboratoryDecisionInput): Promise<ServiceResult<true>>;
}
