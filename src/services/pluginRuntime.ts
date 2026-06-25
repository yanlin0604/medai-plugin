import axios, { type AxiosResponse } from 'axios';
import {
  DOC_REGISTRY,
  getDocByCode,
} from '../config/docRegistry';
import type {
  DocDefinition,
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
import type {
  RuntimeApiResponse,
  RuntimeCreateVersionRequest,
  RuntimeDocDefinitionDto,
  RuntimeDocFieldDto,
  RuntimeDocFieldOptionDto,
  RuntimeDocTemplateDto,
  RuntimeDocValueBundleDto,
  RuntimeDocValues,
  RuntimeDocVersionDto,
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceQueryRequest,
  RuntimeFieldCompletionRequest,
  RuntimeFieldCompletionResponse,
  RuntimeIcdCandidateDto,
  RuntimeRewriteRequest,
  RuntimeRewriteResponse,
  RuntimeRewriteStatus,
  RuntimeRewriteStatusRequest,
  RuntimeWritebackAuditRequest,
  RuntimeWritebackAuditResponse,
} from './pluginRuntimeTypes';
import { buildGenericDocTemplate, docTemplates } from './samples/templates';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const RUNTIME_SUCCESS_CODE = 200;
const RUNTIME_BASE_PATH = '/medical/pluginRuntime';
const LOCAL_TEMPLATE_FIRST_DOC_CODES = new Set(['DOC011', 'D0C011', 'DOC012']);
const STRICT_RUNTIME_TEMPLATE_DOC_CODES = new Set(['DOC010']);
const LOCAL_DEFINITION_FIRST_DOC_CODES = new Set([
  'DOC099',
  'D0C001',
  'DOC001',
  'DOC002',
  'D0C011',
  'DOC011',
  'D0C013',
  'DOC013',
  'DOC012',
  'DOC020',
  'DOC030',
  'DOC010',
  'DOC040',
  'DOC050',
  'DOC060',
]);
const DOC_DISPLAY_ALIAS_CODES: Record<string, string> = {
  D0C001: 'DOC001',
  D0C011: 'DOC011',
  D0C013: 'DOC013',
  DOC030: 'DOC014',
  DOC050: 'DOC009',
};

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
  },
});

function isRuntimeApiResponse(value: unknown): value is RuntimeApiResponse<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && 'code' in value
    && 'msg' in value
  );
}

function normalizeRuntimeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    if (isRuntimeApiResponse(responseData) && responseData.msg) {
      return new Error(responseData.msg);
    }
    return new Error(error.message || '运行时接口请求失败');
  }
  if (error instanceof Error) return error;
  return new Error('运行时接口请求失败');
}

async function requestRuntime<T>(request: Promise<AxiosResponse<RuntimeApiResponse<T>>>): Promise<T> {
  try {
    const response = await request;
    const body = response.data;
    if (!body || body.code !== RUNTIME_SUCCESS_CODE) {
      throw new Error(body?.msg || '运行时接口返回失败');
    }
    return body.data;
  } catch (error) {
    throw normalizeRuntimeError(error);
  }
}

function encodePath(value: string | number): string {
  return encodeURIComponent(String(value));
}

function normalizeDocId(docCode: string): string {
  const match = /^DOC(\d+)$/i.exec(docCode);
  return match ? `doc-${match[1].padStart(3, '0')}` : docCode.toLowerCase();
}

function normalizeParadigm(paradigm: string): ParadigmId {
  switch (paradigm) {
    case 'summary':
    case 'record':
    case 'recording':
    case 'special':
      return paradigm;
    default:
      throw new Error(`未知交互范式: ${paradigm}`);
  }
}

function normalizeWorkspace(workspaceKey?: string): DocWorkspaceId | undefined {
  if (!workspaceKey) return undefined;
  return workspaceKey === 'discharge' ? 'discharge' : undefined;
}

function normalizeFieldSource(source: string): FieldSource {
  switch (source.toLowerCase()) {
    case 'his':
      return 'his';
    case 'emr':
      return 'emr';
    case 'asr':
      return 'asr';
    case 'lis':
      return 'lis';
    case 'pacs':
      return 'pacs';
    case 'manual':
      return 'manual';
    case 'ai':
    case 'icd':
      return 'ai';
    case 'option':
      return 'option';
    default:
      throw new Error(`未知字段来源: ${source}`);
  }
}

function normalizeInputType(inputType: string): FieldInputType {
  switch (inputType) {
    case 'static':
    case 'options':
    case 'text':
    case 'icd':
    case 'date':
      return inputType;
    default:
      throw new Error(`未知字段录入形态: ${inputType}`);
  }
}

function toDocFieldOption(option: RuntimeDocFieldOptionDto): DocFieldOption {
  return {
    value: option.optionValue,
    label: option.optionLabel,
    render: option.renderText ?? option.optionLabel,
  };
}

function byFieldOrder(a: RuntimeDocFieldDto, b: RuntimeDocFieldDto): number {
  return (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0);
}

function byOptionOrder(a: RuntimeDocFieldOptionDto, b: RuntimeDocFieldOptionDto): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

export function toDocDefinition(dto: RuntimeDocDefinitionDto): DocDefinition {
  const registryDoc = getDocByCode(dto.docCode);
  const workspace = normalizeWorkspace(dto.workspaceKey);
  const useLocalDefinition = Boolean(registryDoc && LOCAL_DEFINITION_FIRST_DOC_CODES.has(dto.docCode));

  return {
    code: dto.docCode,
    id: registryDoc?.id ?? normalizeDocId(dto.docCode),
    name: useLocalDefinition ? registryDoc!.name : dto.docName,
    py: useLocalDefinition ? registryDoc!.py : dto.pyCode ?? registryDoc?.py ?? '',
    paradigm: useLocalDefinition ? registryDoc!.paradigm : normalizeParadigm(dto.interactionParadigm),
    group: registryDoc?.group,
    icon: useLocalDefinition ? registryDoc!.icon : dto.iconName || registryDoc?.icon || 'FileTextOutlined',
    prototype: useLocalDefinition ? registryDoc!.prototype : dto.prototypeFile ?? registryDoc?.prototype ?? '',
    dataSources: registryDoc?.dataSources ?? [],
    inputMode: registryDoc?.inputMode ?? '',
    timeLimit: registryDoc?.timeLimit,
    flags: registryDoc?.flags,
    workspace: workspace ?? registryDoc?.workspace,
  };
}

export function toDocTemplate(dto: RuntimeDocTemplateDto): DocTemplate {
  return {
    docCode: dto.docCode,
    version: dto.templateVersion,
    title: dto.title,
    fields: [...dto.fields].sort(byFieldOrder).map(toDocFieldDef),
  };
}

export function toDocFieldDef(field: RuntimeDocFieldDto): DocFieldDef {
  return {
    key: field.fieldKey,
    label: field.fieldLabel,
    section: field.sectionName,
    source: normalizeFieldSource(field.sourceType),
    required: Boolean(field.required),
    inputType: normalizeInputType(field.inputType),
    options: field.options ? [...field.options].sort(byOptionOrder).map(toDocFieldOption) : undefined,
    default: field.defaultValue,
    placeholder: field.placeholder,
    staticText: field.staticText,
    dictatable: field.dictatable,
  };
}

function dedupeDisplayDocuments(docs: DocDefinition[]): DocDefinition[] {
  const docsByDisplayCode = new Map<string, DocDefinition>();

  docs.forEach((doc) => {
    const displayCode = DOC_DISPLAY_ALIAS_CODES[doc.code] ?? doc.code;
    const existing = docsByDisplayCode.get(displayCode);

    if (!existing || (doc.code === displayCode && existing.code !== displayCode)) {
      docsByDisplayCode.set(displayCode, doc);
    }
  });

  return [...docsByDisplayCode.values()];
}

export function toIcdItem(candidate: RuntimeIcdCandidateDto): IcdItem {
  return {
    name: candidate.diagnosisName,
    code: candidate.icdCode,
    confidence: Math.round((candidate.confidence ?? 0) * 100),
    ...(candidate.matched === undefined ? {} : { matched: candidate.matched }),
    ...(candidate.matchSource ? { matchSource: candidate.matchSource } : {}),
    ...(candidate.matchReason ? { matchReason: candidate.matchReason } : {}),
  };
}

export function toDocVersion(dto: RuntimeDocVersionDto): DocVersion {
  return {
    versionNo: dto.versionNo,
    docCode: dto.docCode,
    patientId: dto.patientId,
    content: dto.content,
    fields: dto.fields,
    fieldLabels: dto.fieldLabels,
    fieldOrder: dto.fieldOrder,
    editor: dto.editor ?? '',
    timestamp: dto.timestamp ?? '',
    changeSummary: dto.changeSummary ?? '',
  };
}

function isRuntimeCreateVersionRequest(
  input: RuntimeCreateVersionRequest | DocumentPayload,
): input is RuntimeCreateVersionRequest {
  return 'patientIdHis' in input;
}

function toCreateVersionRequest(
  input: RuntimeCreateVersionRequest | DocumentPayload,
  changeSummary?: string,
  editor?: string,
): RuntimeCreateVersionRequest {
  if (isRuntimeCreateVersionRequest(input)) return input;
  if (changeSummary === undefined) {
    throw new Error('创建文书版本需要变更摘要');
  }
  return {
    patientIdHis: input.patientId,
    content: input.content,
    fields: input.fields,
    fieldLabels: input.fieldLabels,
    fieldOrder: input.fieldOrder,
    editor,
    changeSummary,
  };
}

export async function listRuntimeDocumentDefinitions(): Promise<RuntimeDocDefinitionDto[]> {
  return requestRuntime(http.get(`${RUNTIME_BASE_PATH}/documents`));
}

export async function listRuntimeDocuments(): Promise<DocDefinition[]> {
  try {
    const definitions = await listRuntimeDocumentDefinitions();
    const runtimeDocs = definitions.map(toDocDefinition);
    const runtimeCodes = new Set(runtimeDocs.map((doc) => doc.code));
    return dedupeDisplayDocuments([
      ...runtimeDocs,
      ...DOC_REGISTRY.filter((doc) => !runtimeCodes.has(doc.code)),
    ]);
  } catch {
    return dedupeDisplayDocuments(DOC_REGISTRY);
  }
}

export async function getRuntimeTemplate(docCode: string): Promise<RuntimeDocTemplateDto> {
  return requestRuntime(http.get(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/template`));
}

export async function getRuntimeDocTemplate(docCode: string): Promise<DocTemplate> {
  if (LOCAL_TEMPLATE_FIRST_DOC_CODES.has(docCode)) {
    return docTemplates[docCode] ?? buildGenericDocTemplate(docCode);
  }

  try {
    const template = await getRuntimeTemplate(docCode);
    return toDocTemplate(template);
  } catch (error) {
    if (STRICT_RUNTIME_TEMPLATE_DOC_CODES.has(docCode)) {
      throw error;
    }
    return docTemplates[docCode] ?? buildGenericDocTemplate(docCode);
  }
}

export async function resolveRuntimeValues(
  docCode: string,
  patientIdHis: string,
  skipGeneration = false,
): Promise<RuntimeDocValues> {
  try {
    return await requestRuntime<RuntimeDocValueBundleDto>(
      http.post(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/values`, {
        patientIdHis,
        skipGeneration,
      }),
    );
  } catch {
    return {
      docCode,
      patientIdHis,
      values: {},
      icdCandidates: [],
      pulledSources: [],
      resolvedAt: new Date().toISOString(),
    };
  }
}

export async function getEvidence(request: RuntimeEvidenceQueryRequest): Promise<RuntimeEvidenceBundleDto> {
  return requestRuntime<RuntimeEvidenceBundleDto>(
    http.get(`${RUNTIME_BASE_PATH}/evidence`, { params: request }),
  );
}

export async function completeField(
  request: RuntimeFieldCompletionRequest,
): Promise<RuntimeFieldCompletionResponse> {
  return requestRuntime<RuntimeFieldCompletionResponse>(
    http.post(`${RUNTIME_BASE_PATH}/field-completions`, request),
  );
}

export async function auditFieldWriteback(
  generationId: string,
  request: RuntimeWritebackAuditRequest,
): Promise<RuntimeWritebackAuditResponse> {
  return requestRuntime<RuntimeWritebackAuditResponse>(
    http.post(`${RUNTIME_BASE_PATH}/field-completions/${encodePath(generationId)}/writeback-audit`, request),
  );
}

export async function listDocVersions(docCode: string, patientIdHis: string): Promise<DocVersion[]> {
  const versions = await requestRuntime<RuntimeDocVersionDto[]>(
    http.get(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/versions`, {
      params: { patientIdHis },
    }),
  );
  return versions.map(toDocVersion);
}

export function createDocVersion(
  docCode: string,
  request: RuntimeCreateVersionRequest,
): Promise<DocVersion>;
export function createDocVersion(
  docCode: string,
  payload: DocumentPayload,
  changeSummary: string,
  editor?: string,
): Promise<DocVersion>;
export async function createDocVersion(
  docCode: string,
  input: RuntimeCreateVersionRequest | DocumentPayload,
  changeSummary?: string,
  editor?: string,
): Promise<DocVersion> {
  const request = toCreateVersionRequest(input, changeSummary, editor);
  const version = await requestRuntime<RuntimeDocVersionDto>(
    http.post(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/versions`, request),
  );
  return toDocVersion(version);
}

export async function rewriteText(input: RuntimeRewriteRequest): Promise<RuntimeRewriteResponse> {
  return requestRuntime(http.post(`${RUNTIME_BASE_PATH}/rewrite`, input));
}

export async function updateRewriteStatus(
  requestId: string | number,
  status: RuntimeRewriteStatus,
): Promise<void> {
  const request: RuntimeRewriteStatusRequest = { adoptStatus: status };
  await requestRuntime<null>(
    http.put(`${RUNTIME_BASE_PATH}/rewrite/${encodePath(requestId)}/status`, request),
  );
}

export const pluginRuntimeApi = {
  listRuntimeDocumentDefinitions,
  listRuntimeDocuments,
  getRuntimeTemplate,
  getRuntimeDocTemplate,
  resolveRuntimeValues,
  getEvidence,
  completeField,
  auditFieldWriteback,
  listDocVersions,
  createDocVersion,
  rewriteText,
  updateRewriteStatus,
};
