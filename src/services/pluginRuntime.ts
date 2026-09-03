import { invoke } from '@tauri-apps/api/core';
import axios, { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
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
  Patient,
} from './types';
import type {
  RuntimeApiResponse,
  RuntimeCreateVersionRequest,
  RuntimeDocDefinitionDto,
  RuntimeDocFieldDto,
  RuntimeDocFieldOptionDto,
  RuntimeDocTemplateDto,
  RuntimeDocValueGenerationRequest,
  RuntimeDocValueBundleDto,
  RuntimeDocValues,
  RuntimeDocVersionDto,
  RuntimeEditAssistSuggestionRequest,
  RuntimeEditAssistSuggestionResponse,
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceQueryRequest,
  RuntimeFieldCompletionRequest,
  RuntimeFieldCompletionResponse,
  RuntimeFieldCompositionDto,
  RuntimeIcdCandidateDto,
  RuntimeRewriteRequest,
  RuntimeRewriteResponse,
  RuntimeRewriteStatus,
  RuntimeRewriteStatusRequest,
  RuntimeWritebackAuditRequest,
  RuntimeWritebackAuditResponse,
} from './pluginRuntimeTypes';
import { buildGenericDocTemplate, docTemplates } from './samples/templates';
import { isTauriRuntime } from './windowMode';
import { useAuthStore } from '../stores/useAuthStore';
import { normalizePatientGender } from './patientGender';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const DEBUG_RUNTIME_HTTP = import.meta.env.DEV || import.meta.env.VITE_DEBUG_RUNTIME_HTTP === 'true';
const RUNTIME_SUCCESS_CODE = 200;
const RUNTIME_COMPAT_SUCCESS_CODE = 0;
const RUNTIME_BASE_PATH = '/medical/pluginRuntime';
const LOCAL_TEMPLATE_FIRST_DOC_CODES = new Set<string>([]);
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

interface TauriRuntimeProxyResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  data: unknown;
}

function stringifyHeaderValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function toHeaderRecord(headers: InternalAxiosRequestConfig['headers']): Record<string, string> {
  const headerEntries = typeof headers?.toJSON === 'function'
    ? Object.entries(headers.toJSON())
    : Object.entries(headers ?? {});

  return Object.fromEntries(
    headerEntries
      .map(([key, value]) => [key, stringifyHeaderValue(value)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function appendParams(url: string, params: unknown): string {
  if (!params || typeof params !== 'object') return url;
  const [path, hash = ''] = url.split('#');
  const [basePath, query = ''] = path.split('?');
  const searchParams = new URLSearchParams(query);

  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value == null) return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => {
      if (item != null) searchParams.append(key, String(item));
    });
  });

  const queryString = searchParams.toString();
  return `${basePath}${queryString ? `?${queryString}` : ''}${hash ? `#${hash}` : ''}`;
}

function parseRequestBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function buildRuntimeRequestUrl(config: InternalAxiosRequestConfig): string {
  const baseUrl = String(config.baseURL ?? '').replace(/\/+$/, '');
  const requestUrl = String(config.url ?? '');
  const url = /^https?:\/\//i.test(requestUrl)
    ? requestUrl
    : `${baseUrl}${requestUrl.startsWith('/') ? '' : '/'}${requestUrl}`;

  return appendParams(url, config.params);
}

const tauriRuntimeAdapter: AxiosAdapter = async (config) => {
  const method = String(config.method ?? 'GET').toUpperCase();
  const requestUrl = buildRuntimeRequestUrl(config);
  if (DEBUG_RUNTIME_HTTP) {
    console.info('[runtime-http] ->', method, requestUrl);
  }

  const response = await invoke<TauriRuntimeProxyResponse>('runtime_http_request', {
    request: {
      method,
      url: requestUrl,
      headers: toHeaderRecord(config.headers),
      body: parseRequestBody(config.data) ?? null,
    },
  });

  if (DEBUG_RUNTIME_HTTP) {
    console.info('[runtime-http] <-', method, requestUrl, response.status);
  }

  return {
    data: response.data,
    status: response.status,
    statusText: response.status_text,
    headers: response.headers,
    config,
    request: null,
  };
};

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
  },
  ...(isTauriRuntime() ? { adapter: tauriRuntimeAdapter } : {}),
});

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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

function isRuntimeSuccessCode(code: unknown): boolean {
  return code === RUNTIME_SUCCESS_CODE || code === RUNTIME_COMPAT_SUCCESS_CODE;
}

async function requestRuntime<T>(request: Promise<AxiosResponse<RuntimeApiResponse<T>>>): Promise<T> {
  try {
    const response = await request;
    const body = response.data;
    if (!body || !isRuntimeSuccessCode(body.code)) {
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
    case 'textarea':
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
    disableRegenerate: field.renderRule?.disableRegenerate,
    roundDriven: field.renderRule?.roundDriven,
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
  context: Omit<RuntimeDocValueGenerationRequest, 'patientIdHis' | 'skipGeneration'> = {},
): Promise<RuntimeDocValues> {
  return requestRuntime<RuntimeDocValueBundleDto>(
    http.post(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/values`, {
      patientIdHis,
      skipGeneration,
      ...context,
    }),
  );
}

export async function getEvidence(request: RuntimeEvidenceQueryRequest): Promise<RuntimeEvidenceBundleDto> {
  return requestRuntime<RuntimeEvidenceBundleDto>(
    http.get(`${RUNTIME_BASE_PATH}/evidence`, { params: request }),
  );
}

export async function getFieldComposition(
  docCode: string,
  fieldKey: string,
  params?: {
    doctorCode?: string;
    doctorName?: string;
    deptCode?: string;
    hospitalCode?: string;
    clientId?: string;
  },
): Promise<RuntimeFieldCompositionDto> {
  return requestRuntime<RuntimeFieldCompositionDto>(
    http.get(`${RUNTIME_BASE_PATH}/documents/${encodePath(docCode)}/fields/${encodePath(fieldKey)}/composition`, {
      params,
    }),
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

export async function getEditAssistSuggestions(
  request: RuntimeEditAssistSuggestionRequest,
): Promise<RuntimeEditAssistSuggestionResponse> {
  return requestRuntime<RuntimeEditAssistSuggestionResponse>(
    http.post(`${RUNTIME_BASE_PATH}/edit-assist/suggestions`, request),
  );
}

interface RuntimePatientDto {
  id?: string | number;
  patientNo?: string | number;
  patientId?: string | number;
  patientIdHis?: string | number;
  inpatientNo?: string | number;
  admissionNo?: string | number;
  patientName?: string;
  name?: string;
  gender?: string;
  sex?: string;
  age?: string | number;
  bedNo?: string | number;
  bedNumber?: string | number;
  bedName?: string | number;
  deptName?: string;
  deptCode?: string;
  admissionDate?: string;
  inTime?: string;
  admissionDays?: number;
  hospitalDays?: number;
  doctor?: string;
  doctorName?: string;
  attendingDoctorName?: string;
  diagnosis?: string;
  mainDiagnosis?: string;
  diagnoseName?: string;
}

interface PatientListPayload {
  records?: RuntimePatientDto[];
  list?: RuntimePatientDto[];
  rows?: RuntimePatientDto[];
  total?: number;
}

export interface PatientListResult {
  patients: Patient[];
  total: number;
}

export type OcrStatus = 'success' | 'failed';
export type OcrEngine = 'baidu' | 'vlm' | 'llm';

export interface OcrBlockLocation {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrBlock {
  words: string;
  location: OcrBlockLocation | null;
}

export interface BizOcrResultVo {
  id?: number;
  bizType?: string;
  bizId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  ocrMode?: string;
  ocrText?: string;
  blockCount?: number;
  costMs?: number;
  status?: OcrStatus | string;
  errorMsg?: string;
  userId?: number;
  createTime?: string;
}

export interface OcrRecognizeResult {
  ocrId?: number;
  text?: string;
  blocks?: OcrBlock[];
  engine?: string;
  fileName?: string;
  fileUrl?: string;
  costMs?: number;
  status?: string;
}

export interface OcrRecognizeOptions {
  bizType?: string;
  bizId?: string;
  engine?: OcrEngine;
}

export interface OcrListParams {
  bizId: string;
  bizType?: string;
}

export interface OcrListResult {
  total: number;
  rows: BizOcrResultVo[];
}

interface OcrListPayload {
  total?: number;
  rows?: OcrRecordDto[];
  records?: OcrRecordDto[];
  list?: OcrRecordDto[];
  code?: number;
  msg?: string;
  data?: OcrListPayload | OcrRecordDto[];
}

type OcrRecordDto = BizOcrResultVo & OcrRecognizeResult & {
  createdTime?: string;
  uploadTime?: string;
};

function hasOcrListShape(value: unknown): value is OcrListPayload | OcrRecordDto[] {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  return ['total', 'rows', 'records', 'list'].some((key) => key in value);
}

function readText(...values: unknown[]): string {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return value === undefined ? '' : String(value).trim();
}

function readNumber(...values: unknown[]): number {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readOptionalNumber(...values: unknown[]): number | undefined {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizePatient(dto: RuntimePatientDto): Patient | null {
  const id = readText(dto.patientIdHis, dto.patientNo, dto.inpatientNo, dto.admissionNo, dto.patientId, dto.id);
  const name = readText(dto.patientName, dto.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    gender: normalizePatientGender(readText(dto.gender, dto.sex)),
    age: readText(dto.age),
    bedNo: readText(dto.bedNo, dto.bedNumber, dto.bedName),
    deptName: readText(dto.deptName, dto.deptCode),
    admissionDate: readText(dto.admissionDate, dto.inTime),
    admissionDays: readNumber(dto.admissionDays, dto.hospitalDays),
    doctor: readText(dto.doctor, dto.doctorName, dto.attendingDoctorName),
    diagnosis: readText(dto.diagnosis, dto.mainDiagnosis, dto.diagnoseName),
  };
}

function unwrapPatientListPayload(payload: unknown): PatientListPayload {
  if (Array.isArray(payload)) {
    return { records: payload as RuntimePatientDto[], total: payload.length };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { records: [], total: 0 };
  }

  const record = payload as PatientListPayload;
  const records = record.records ?? record.list ?? record.rows ?? [];
  return {
    records,
    total: record.total ?? records.length,
  };
}

export async function listPatients(): Promise<PatientListResult> {
  const requestUrl = `${API_BASE_URL}/medical/patient/list`;
  console.info('[patient-list] GET', requestUrl);

  const payload = await requestRuntime<unknown>(
    http.get('/medical/patient/list'),
  );
  const { records, total } = unwrapPatientListPayload(payload);
  const patients = records.map(normalizePatient).filter((patient): patient is Patient => Boolean(patient));
  console.info('[patient-list] response', {
    total,
    rawCount: records.length,
    patientCount: patients.length,
    payload,
  });

  return {
    patients,
    total,
  };
}

async function requestRuntimeUpload<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  const body = await response.json() as RuntimeApiResponse<T>;
  if (!response.ok || !body || !isRuntimeSuccessCode(body.code)) {
    throw new Error(body?.msg || `请求失败：${response.status}`);
  }
  return body.data;
}

function normalizeOcrRecord(dto: OcrRecordDto): BizOcrResultVo {
  return {
    id: readOptionalNumber(dto.id, dto.ocrId),
    bizType: readText(dto.bizType) || undefined,
    bizId: readText(dto.bizId) || undefined,
    fileName: readText(dto.fileName) || undefined,
    fileUrl: readText(dto.fileUrl) || undefined,
    fileSize: readOptionalNumber(dto.fileSize),
    ocrMode: readText(dto.ocrMode, dto.engine) || undefined,
    ocrText: readText(dto.ocrText, dto.text) || undefined,
    blockCount: readOptionalNumber(dto.blockCount, dto.blocks?.length),
    costMs: readOptionalNumber(dto.costMs),
    status: readText(dto.status) || undefined,
    errorMsg: readText(dto.errorMsg) || undefined,
    userId: readOptionalNumber(dto.userId),
    createTime: readText(dto.createTime, dto.createdTime, dto.uploadTime) || undefined,
  };
}

function unwrapOcrListPayload(payload: unknown): OcrListResult {
  if (Array.isArray(payload)) {
    const rows = (payload as OcrRecordDto[]).map(normalizeOcrRecord);
    return { total: rows.length, rows };
  }
  if (typeof payload !== 'object' || payload === null) {
    return { total: 0, rows: [] };
  }

  const record = payload as OcrListPayload;
  const rows = record.rows ?? record.records ?? record.list ?? [];
  return {
    total: record.total ?? rows.length,
    rows: rows.map(normalizeOcrRecord),
  };
}

async function requestOcrList(request: Promise<AxiosResponse<unknown>>): Promise<OcrListResult> {
  try {
    const response = await request;
    const body = response.data as (OcrListPayload & { code?: number; msg?: string; data?: OcrListPayload }) | null;
    if (!body || typeof body !== 'object') {
      throw new Error('查询识别记录返回为空');
    }
    if (body.code !== undefined && !isRuntimeSuccessCode(body.code)) {
      throw new Error(body.msg || '查询识别记录失败');
    }
    const payload = hasOcrListShape(body.data) ? body.data : body;
    return unwrapOcrListPayload(payload);
  } catch (error) {
    throw normalizeRuntimeError(error);
  }
}

export async function listOcrRecords(params: OcrListParams): Promise<OcrListResult> {
  const requestUrl = appendParams(`${API_BASE_URL}${RUNTIME_BASE_PATH}/ocr/records`, params);
  console.info('[ocr] GET', requestUrl);
  return requestOcrList(http.get(`${RUNTIME_BASE_PATH}/ocr/records`, { params }));
}

export async function recognizeOcrImage(
  file: File,
  options: OcrRecognizeOptions = {},
): Promise<OcrRecognizeResult> {
  const engine: OcrEngine = options.engine === 'vlm' || options.engine === 'llm' ? 'vlm' : 'baidu';

  const formData = new FormData();
  formData.append('file', file);

  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const requestUrl = appendParams(`${API_BASE_URL}${RUNTIME_BASE_PATH}/ocr`, {
    bizType: options.bizType,
    bizId: options.bizId,
    engine,
  });
  console.info('[ocr] POST', requestUrl, file.name);
  return requestRuntimeUpload<OcrRecognizeResult>(
    fetch(requestUrl, {
      method: 'POST',
      headers,
      body: formData,
    }),
  );
}

export interface RoundPendingSegment {
  id: number;
  roundTaskId: number;
  patientIdHis?: string;
  patientName?: string;
  bedNo?: string;
  transcribeText: string;
  alignTimestamp?: string;
  status?: 'pending' | 'applied' | 'ignored';
  isUnassigned?: boolean;
}

export interface RoundPendingStatusResponse {
  roundTaskId: number | null;
  hasPendingSegment: boolean;
  patientSegment: RoundPendingSegment | null;
  hasPendingAssignedSegments: boolean;
  hasPendingUnassignedSegments: boolean;
  assignedSegments: RoundPendingSegment[];
  unassignedCount: number;
  unassignedSegments: RoundPendingSegment[];
}

export interface RoundRosterPatient {
  patientIdHis: string;
  patientName: string;
  bedNo: string;
  gender?: string;
  age?: string;
  diagnosis?: string;
  deptCode?: string;
  deptName?: string;
  attendingDoctorName?: string;
}

export async function getRoundRoster(params: {
  deptCode?: string;
  deptName?: string;
}): Promise<RoundRosterPatient[]> {
  return requestRuntime<RoundRosterPatient[]>(
    http.get('/medical/round/roster', {
      params,
    }),
  );
}

export async function getRoundPendingStatus(
  patientIdHis: string,
  doctorCode: string,
): Promise<RoundPendingStatusResponse> {
  return requestRuntime<RoundPendingStatusResponse>(
    http.get('/medical/round/pending-status', {
      params: { patientIdHis, doctorCode },
    }),
  );
}

export async function markRoundStatus(
  alignId: number | string,
  status: 'applied' | 'ignored' | 'pending',
): Promise<void> {
  await requestRuntime<null>(
    http.post('/medical/round/mark-status', {
      id: Number(alignId),
      status,
    }),
  );
}

export async function claimAndApplyRoundSegments(request: {
  segmentIds: number[];
  patientIdHis: string;
  patientName: string;
  bedNo?: string;
}): Promise<void> {
  await requestRuntime<null>(
    http.post('/medical/round/claim-and-apply', request),
  );
}

export interface SurgeryTranscribeRequest {
  patientIdHis: string;
  docCode: string;
  audioOssIds: string[];
  previousTranscript?: string;
}

export interface SurgeryTranscribeResponse {
  transcriptText: string;
  fields: Record<string, string>;
}

export async function transcribeSurgery(
  request: SurgeryTranscribeRequest,
): Promise<SurgeryTranscribeResponse> {
  return requestRuntime<SurgeryTranscribeResponse>(
    http.post(`${RUNTIME_BASE_PATH}/surgery/transcribe`, request),
  );
}

export const pluginRuntimeApi = {
  listRuntimeDocumentDefinitions,
  listRuntimeDocuments,
  getRuntimeTemplate,
  getRuntimeDocTemplate,
  resolveRuntimeValues,
  getEvidence,
  getFieldComposition,
  completeField,
  auditFieldWriteback,
  listDocVersions,
  createDocVersion,
  rewriteText,
  updateRewriteStatus,
  getEditAssistSuggestions,
  listPatients,
  listOcrRecords,
  recognizeOcrImage,
  getRoundRoster,
  getRoundPendingStatus,
  markRoundStatus,
  claimAndApplyRoundSegments,
  transcribeSurgery,
};
