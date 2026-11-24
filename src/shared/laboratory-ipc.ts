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

export interface LaboratoryApi {
  startAnalysis(input: LaboratoryStartInput): Promise<ServiceResult<string>>;
  addSample(input: LaboratorySampleInput): Promise<ServiceResult<string>>;
  recordResult(input: LaboratoryResultInput): Promise<ServiceResult<string>>;
  recordCalculation(input: LaboratoryCalculationInput): Promise<ServiceResult<string>>;
  submitReview(input: LaboratoryAnalysisInput): Promise<ServiceResult<string>>;
  decideReview(input: LaboratoryDecisionInput): Promise<ServiceResult<true>>;
}
