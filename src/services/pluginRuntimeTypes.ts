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
  editable?: boolean;
  metaSlot?: string;
  readOnlyHint?: string;
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
  updatedAt?: string;
  errorMessage?: string;
}

export interface RuntimeIcdCandidateDto {
  icdCode: string;
  icdVersion?: string;
  diagnosisName: string;
  reason?: string;
  confidence?: number;
  simulated?: boolean;
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
