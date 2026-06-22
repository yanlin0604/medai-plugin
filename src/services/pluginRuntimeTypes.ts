import type {
  DataSource,
  DocDefinition,
  DocGroupId,
  DocWorkspaceId,
  ParadigmId,
} from '../config/docRegistry';
import type {
  DocFieldDef,
  DocFieldOption,
  DocTemplate,
  DocVersion,
  DocumentPayload,
  FieldInputType,
  FieldSource,
  IcdItem,
} from './types';

export interface RuntimeApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface RuntimeDocDefinitionDto {
  docCode: string;
  docName: string;
  interactionParadigm: string;
  templateVersion: string;
  pyCode?: string;
  iconName?: string;
  prototypeFile?: string;
  workspaceKey?: string;
}

export interface RuntimeDocTemplateDto {
  docCode: string;
  docName: string;
  templateVersion: string;
  title: string;
  fields: RuntimeDocFieldDto[];
}

export interface RuntimeDocFieldDto {
  fieldKey: string;
  fieldLabel: string;
  sectionName: string;
  fieldOrder: number;
  sourceType: string;
  inputType: string;
  required?: boolean;
  dictatable?: boolean;
  defaultValue?: string;
  placeholder?: string;
  staticText?: string;
  writebackFieldKey?: string;
  renderRule?: RuntimeFieldRenderRuleDto;
  validationRule?: Record<string, unknown>;
  options?: RuntimeDocFieldOptionDto[];
}

export interface RuntimeDocFieldOptionDto {
  optionValue: string;
  optionLabel: string;
  renderText?: string;
  sortOrder?: number;
  defaultOption?: boolean;
}

export interface RuntimeFieldRenderRuleDto {
  valueRef?: RuntimeFieldValueRefDto;
  generation?: RuntimeFieldGenerationRuleDto;
  editable?: boolean;
  metaSlot?: string;
  readOnlyHint?: string;
  defaultValueMode?: string;
  calculation?: RuntimeFieldCalculationDto;
  todayDocMerge?: RuntimeTodayDocMergeRuleDto;
  evidence?: RuntimeFieldEvidenceRuleDto;
}

export interface RuntimeFieldGenerationRuleDto {
  strategy?: 'direct' | 'calculate' | 'extract' | 'evidence_summary' | 'ai_summary' | 'hybrid' | string;
  sources?: RuntimeGenerationSourceRefDto[];
  promptKey?: string;
  fallbackMode?: 'empty' | 'default' | 'concat' | 'evidence_concat' | string;
  requireTimeline?: boolean;
  auditEnabled?: boolean;
  focusHints?: string[];
}

export interface RuntimeGenerationSourceRefDto {
  sourceSystem?: string;
  adapterKey?: string;
  sourcePath?: string;
  transform?: string;
  required?: boolean;
  evidenceTypes?: string[];
}

export interface RuntimeFieldCalculationDto {
  type?: string;
  startField?: string;
  endField?: string;
  minDays?: number;
  suffix?: string;
}

export interface RuntimeTodayDocMergeRuleDto {
  enabled?: boolean;
  fieldKeys?: string[];
  excludeDocCodes?: string[];
  maxChars?: number;
}

export type RuntimeEvidenceWritebackMode = 'fill' | 'append' | 'overwrite';
export type RuntimeFieldCompletionMode = 'generate' | 'append' | 'rewrite_selection';

export interface RuntimeEvidenceQueryRequest {
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
}

export interface RuntimeFieldEvidenceRuleDto {
  enabled?: boolean;
  sourceSystems?: string[];
  evidenceTypes?: string[];
  requireTimeline?: boolean;
  generationMode?: string;
  defaultWritebackMode?: RuntimeEvidenceWritebackMode;
  minEvidenceCount?: number;
  focusHints?: string[];
}

export interface RuntimeEvidenceItemDto {
  evidenceId: string;
  patientId?: string;
  visitId?: string;
  sourceSystem: string;
  evidenceType: string;
  occurredAt?: string;
  title?: string;
  summary?: string;
  originalText?: string;
  structuredData?: Record<string, unknown>;
  abnormalFlag?: 'normal' | 'abnormal' | 'critical' | 'unknown' | string;
  confidence?: 'high' | 'medium' | 'low' | string;
  simulated?: boolean;
}

export interface RuntimeEvidenceSourceStatusDto {
  sourceSystem: string;
  status: 'success' | 'empty' | 'failed' | 'disabled' | string;
  hit?: boolean;
  evidenceCount?: number;
  simulated?: boolean;
  pulledAt?: string;
  responseTimeMs?: number;
  message?: string;
}

export interface RuntimeEvidenceBundleDto {
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
  rule?: RuntimeFieldEvidenceRuleDto;
  evidenceItems: RuntimeEvidenceItemDto[];
  sourceStatuses: RuntimeEvidenceSourceStatusDto[];
  warnings: string[];
  resolvedAt?: string;
}

export interface RuntimeEvidenceSummaryDto {
  evidenceId: string;
  sourceSystem: string;
  evidenceType: string;
  occurredAt?: string;
  title?: string;
  summary?: string;
  abnormalFlag?: string;
  confidence?: string;
}

export interface RuntimeFieldCompletionRequest {
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
  fieldName?: string;
  currentText?: string;
  selectedEvidenceIds?: string[];
  selectedText?: string;
  mode?: RuntimeFieldCompletionMode;
  instruction?: string;
  transcriptText?: string;
}

export interface RuntimeFieldCompletionResponse {
  generationId: string;
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
  generatedText: string;
  usedEvidenceIds: string[];
  evidenceSummary: RuntimeEvidenceSummaryDto[];
  warnings: string[];
  recommendedWritebackMode?: RuntimeEvidenceWritebackMode;
  responseTimeMs?: number;
  generatedAt?: string;
}

export interface RuntimeFieldCompletionAuditDto {
  generationId: string;
  patientId?: string;
  visitId?: string;
  documentType?: string;
  docCode?: string;
  fieldKey?: string;
  completionStatus?: string;
  usedEvidenceIds?: string[];
  writebackMode?: RuntimeEvidenceWritebackMode;
  doctorId?: string;
  doctorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RuntimeWritebackAuditRequest {
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
  writebackMode: RuntimeEvidenceWritebackMode;
  finalText?: string;
  doctorId?: string;
  doctorName?: string;
}

export interface RuntimeWritebackAuditResponse {
  generationId: string;
  patientId: string;
  visitId: string;
  documentType: string;
  docCode: string;
  fieldKey: string;
  audited?: boolean;
  completionStatus?: string;
  message?: string;
  auditedAt?: string;
}

export interface RuntimeFieldValueRefDto {
  adapterKey?: string;
  sourcePath?: string;
  transform?: string;
}

export interface RuntimeDocValueBundleDto {
  docCode: string;
  patientIdHis: string;
  values: Record<string, RuntimeFieldValueDto>;
  icdCandidates: RuntimeIcdCandidateDto[];
  pulledSources: RuntimePulledSourceDto[];
  resolvedAt?: string;
}

export type RuntimeDocValues = RuntimeDocValueBundleDto;

export interface RuntimeFieldValueDto {
  fieldKey: string;
  value: unknown;
  sourceType?: string;
  sourcePath?: string;
  simulated?: boolean;
  updateTime?: string;
  updatedAt?: string;
  errorMessage?: string;
  strategyType?: string;
  generationId?: string;
  usedEvidenceIds?: string[];
  sourceStatuses?: RuntimeEvidenceSourceStatusDto[];
  warnings?: string[];
}

export interface RuntimeIcdCandidateDto {
  icdCode: string;
  icdVersion?: string;
  diagnosisName: string;
  reason?: string;
  confidence?: number;
  simulated?: boolean;
  matched?: boolean;
  matchSource?: string;
  matchReason?: string;
}

export interface RuntimePulledSourceDto {
  adapterKey: string;
  sourceType: string;
  simulated?: boolean;
  hit?: boolean;
  pulledAt?: string;
  errorMessage?: string;
}

export interface RuntimeCreateVersionRequest {
  patientIdHis: string;
  content: string;
  fields: Record<string, string>;
  fieldLabels?: Record<string, string>;
  fieldOrder?: string[];
  editor?: string;
  changeSummary?: string;
}

export interface RuntimeDocVersionDto {
  versionNo: number;
  docCode: string;
  patientId: string;
  content: string;
  fields: Record<string, string>;
  fieldLabels?: Record<string, string>;
  fieldOrder?: string[];
  editor?: string;
  timestamp?: string;
  changeSummary?: string;
}

export type RuntimeRewriteType = 'polish' | 'academic' | 'expand' | 'shorten' | 'custom';
export type RuntimeRewriteStatus = 'adopted' | 'rejected';

export interface RuntimeRewriteRequest {
  docCode: string;
  patientIdHis: string;
  sectionKey: string;
  rewriteType: RuntimeRewriteType;
  selectedText: string;
  customInstruction?: string;
}

export type RewriteInput = RuntimeRewriteRequest;

export interface RuntimeRewriteResponse {
  requestId: string;
  before: string;
  after: string;
  rewriteType: string;
  responseTimeMs?: number;
}

export type RewriteResult = RuntimeRewriteResponse;

export interface RuntimeRewriteStatusRequest {
  adoptStatus: RuntimeRewriteStatus;
}

export type RuntimeDocDefinition = DocDefinition;
export type RuntimeFrontendDocTemplate = DocTemplate;
export type RuntimeFrontendDocVersion = DocVersion;
export type RuntimeDocumentPayload = DocumentPayload;
export type RuntimeIcdItem = IcdItem;
export type RuntimeDocGroupId = DocGroupId;
export type RuntimeParadigmId = ParadigmId;
export type RuntimeDocWorkspaceId = DocWorkspaceId;
export type RuntimeDataSource = DataSource;
export type RuntimeFieldSource = FieldSource;
export type RuntimeFieldInputType = FieldInputType;
export type RuntimeDocFieldDef = DocFieldDef;
export type RuntimeDocFieldOption = DocFieldOption;
export type RuntimeEvidenceQuery = RuntimeEvidenceQueryRequest;
export type RuntimeEvidenceBundle = RuntimeEvidenceBundleDto;
export type RuntimeEvidenceItem = RuntimeEvidenceItemDto;
export type RuntimeFieldCompletion = RuntimeFieldCompletionResponse;
