/**
 * 入院记录运行时服务。
 *
 * 与 dischargeRuntime.ts 保持一致的架构：
 * - 后端驱动的模板 + 字段值加载
 * - 渐进式加载（先模板骨架、后字段值）
 * - 单字段重新生成
 * - 运行时缓存
 */

import type { PatientBrief } from '../components/clinical/EmrContextCard';
import type { ClinicalFieldCalculation, ClinicalSection, FieldSource, IcdItem } from './types';
import { pluginRuntimeApi, toIcdItem } from './pluginRuntime';
import { loadDraft } from './draftService';
import type {
  RuntimeDocFieldDto,
  RuntimeFieldCalculationDto,
  RuntimeDocTemplateDto,
  RuntimeDocValueBundleDto,
  RuntimeFieldValueDto,
  RuntimeIcdCandidateDto,
} from './pluginRuntimeTypes';

export interface AdmissionRuntimeState {
  template: RuntimeDocTemplateDto;
  values: RuntimeDocValueBundleDto;
  sections: ClinicalSection[];
  metaFieldKeys: string[];
  readOnlyHints: Record<string, string>;
  icdCandidates: IcdItem[];
}

export interface AdmissionRuntimeFieldState {
  values: RuntimeDocValueBundleDto;
  section: ClinicalSection;
  readOnlyHint: string;
  icdCandidates: IcdItem[];
}

const runtimeCache = new Map<string, Promise<AdmissionRuntimeState>>();

interface LoadAdmissionRuntimeOptions {
  forceRefresh?: boolean;
}

function runtimeCacheKey(docCode: string, patientIdHis: string): string {
  return `admission:${docCode}:${patientIdHis}`;
}

function hasDraft(docCode: string, patientIdHis: string): boolean {
  const draft = loadDraft(docCode, patientIdHis);
  return !!draft && Object.keys(draft.values || {}).length > 0;
}

export function clearAdmissionRuntimeCache(docCode?: string, patientIdHis?: string): void {
  if (!docCode || !patientIdHis) {
    runtimeCache.clear();
    return;
  }
  runtimeCache.delete(runtimeCacheKey(docCode, patientIdHis));
}

export async function loadAdmissionRuntime(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
  options: LoadAdmissionRuntimeOptions = {},
): Promise<AdmissionRuntimeState> {
  const cacheKey = runtimeCacheKey(docCode, patientIdHis);
  if (options.forceRefresh) {
    runtimeCache.delete(cacheKey);
  }

  let promise = runtimeCache.get(cacheKey);
  if (!promise) {
    const skipGeneration = !options.forceRefresh && hasDraft(docCode, patientIdHis);
    promise = Promise.all([
      pluginRuntimeApi.getRuntimeTemplate(docCode),
      pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis, skipGeneration),
    ])
      .then(([template, values]) => buildAdmissionRuntime(template, values, patient))
      .catch((error) => {
        runtimeCache.delete(cacheKey);
        throw error;
      });
    runtimeCache.set(cacheKey, promise);
  }

  return promise;
}

export async function loadAdmissionRuntimeTemplate(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
): Promise<AdmissionRuntimeState> {
  const template = await pluginRuntimeApi.getRuntimeTemplate(docCode);
  return buildAdmissionRuntime(template, emptyRuntimeValues(docCode, patientIdHis), patient);
}

export async function loadAdmissionRuntimeValues(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
  template: RuntimeDocTemplateDto,
  options: { skipGeneration?: boolean } = {},
): Promise<AdmissionRuntimeState> {
  const values = await pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis, options.skipGeneration);
  const runtime = buildAdmissionRuntime(template, values, patient);
  runtimeCache.set(runtimeCacheKey(docCode, patientIdHis), Promise.resolve(runtime));
  return runtime;
}

export async function loadAdmissionRuntimeField(
  docCode: string,
  patientIdHis: string,
  fieldKey: string,
  template: RuntimeDocTemplateDto,
): Promise<AdmissionRuntimeFieldState> {
  const values = await pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis, false);
  return buildAdmissionRuntimeField(template, values, fieldKey);
}

export function buildAdmissionRuntime(
  template: RuntimeDocTemplateDto,
  values: RuntimeDocValueBundleDto,
  _patient: PatientBrief,
): AdmissionRuntimeState {
  validateRuntimeConfig(template, values);
  const sortedFields = [...template.fields].sort(byFieldOrder);
  const fieldValues = values.values ?? {};
  const sections = applyAdmissionFieldAutomation(
    sortedFields.map((field) => toClinicalSection(field, fieldValues[field.fieldKey])),
  );
  const metaFieldKeys = sortedFields.filter(isMetaField).map((field) => field.fieldKey);
  const readOnlyHints = Object.fromEntries(
    sortedFields
      .map((field) => [field.fieldKey, readOnlyHintOf(field, fieldValues[field.fieldKey])] as const)
      .filter(([, hint]) => Boolean(hint)),
  );

  return {
    template,
    values,
    sections,
    metaFieldKeys,
    readOnlyHints,
    icdCandidates: values.icdCandidates?.map(toIcdItem) ?? [],
  };
}

export function buildAdmissionRuntimeField(
  template: RuntimeDocTemplateDto,
  values: RuntimeDocValueBundleDto,
  fieldKey: string,
): AdmissionRuntimeFieldState {
  validateRuntimeConfig(template, values);
  const field = template.fields.find((item) => item.fieldKey === fieldKey);
  if (!field) {
    throw new Error(`后台入院记录模板未配置字段：${fieldKey}`);
  }
  const value = values.values?.[fieldKey];

  return {
    values,
    section: toClinicalSection(field, value),
    readOnlyHint: readOnlyHintOf(field, value),
    icdCandidates: values.icdCandidates?.map(toIcdItem) ?? [],
  };
}

export function isAdmissionMetaSection(section: ClinicalSection, metaFieldKeys: string[]): boolean {
  return metaFieldKeys.includes(section.key);
}

// ==================== 内部辅助函数 ====================

function toClinicalSection(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): ClinicalSection {
  return {
    key: field.fieldKey,
    title: field.sectionName || field.fieldLabel,
    text: resolveFieldText(field, value),
    fieldKey: field.writebackFieldKey || field.fieldKey,
    editable: field.inputType !== 'static',
    inputType: field.inputType,
    calculation: toClinicalCalculation(field.renderRule?.calculate),
    source: normalizeFieldSource(field.sourceType),
    required: Boolean(field.required),
    evidenceEnabled: Boolean(field.renderRule?.evidence?.sources?.length),
    disableRegenerate: field.renderRule?.disableRegenerate,
  };
}

function validateRuntimeConfig(template: RuntimeDocTemplateDto, values: RuntimeDocValueBundleDto) {
  if (!template.fields?.length) {
    throw new Error('后台入院记录模板未配置字段');
  }
  if (values.docCode && template.docCode && values.docCode !== template.docCode) {
    throw new Error('后台入院记录模板与字段取值文书编码不一致');
  }

  const fieldKeys = new Set<string>();
  const writebackKeys = new Set<string>();
  template.fields.forEach((field, index) => {
    const fieldName = field.fieldLabel || field.sectionName || `第${index + 1}个字段`;
    if (!field.fieldKey?.trim()) {
      throw new Error(`后台入院记录模板字段「${fieldName}」未配置字段键`);
    }
    if (!field.fieldLabel?.trim() && !field.sectionName?.trim()) {
      throw new Error(`后台入院记录模板字段「${field.fieldKey}」未配置展示名称`);
    }
    if (fieldKeys.has(field.fieldKey)) {
      throw new Error(`后台入院记录模板字段键重复：${field.fieldKey}`);
    }
    fieldKeys.add(field.fieldKey);

    const writebackKey = field.writebackFieldKey || field.fieldKey;
    if (!writebackKey.trim()) {
      throw new Error(`后台入院记录模板字段「${fieldName}」未配置回写字段键`);
    }
    if (writebackKeys.has(writebackKey)) {
      throw new Error(`后台入院记录模板回写字段键重复：${writebackKey}`);
    }
    writebackKeys.add(writebackKey);
  });
}

/** 入院记录的 meta 字段（入院日期等显示在顶部表格的字段） */
const FORCED_META_FIELD_KEYS = new Set(['admissionDate']);

function isMetaField(field: RuntimeDocFieldDto): boolean {
  return FORCED_META_FIELD_KEYS.has(field.fieldKey);
}

function resolveFieldText(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): string {
  // AI字段生成失败时，即使有兜底内容也不使用
  if (value?.errorMessage || value?.warnings?.some(w => w.includes('AI字段生成失败'))) {
    return '';
  }

  const resolved = runtimeValueToText(value?.value);
  if (resolved) return resolved;

  if (field.renderRule?.default?.mode === 'today') return todayDate();
  return field.staticText || field.defaultValue || '';
}

export function applyAdmissionFieldAutomation(sections: ClinicalSection[]): ClinicalSection[] {
  const values = Object.fromEntries(sections.map((section) => [section.key, section.text]));
  return sections.map((section) => {
    const calculated = calculateSectionText(section.calculation, values);
    return calculated == null ? section : { ...section, text: calculated };
  });
}

function calculateSectionText(
  calculation: ClinicalFieldCalculation | undefined,
  values: Record<string, string>,
): string | null {
  if (calculation?.type !== 'daysBetween' || !calculation.startField || !calculation.endField) return null;
  const start = parseDateOnly(values[calculation.startField] ?? '');
  const end = parseDateOnly(values[calculation.endField] ?? '');
  if (!start || !end) return '';
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (diffDays < 0) return '';
  const days = Math.max(calculation.minDays ?? 1, diffDays);
  return `${days}${calculation.suffix ?? '天'}`;
}

function toClinicalCalculation(calculation: RuntimeFieldCalculationDto | undefined): ClinicalFieldCalculation | undefined {
  if (!calculation || calculation.type !== 'daysBetween') return undefined;
  return {
    type: calculation.type,
    startField: calculation.start,
    endField: calculation.end,
    minDays: calculation.min,
    suffix: calculation.suffix,
  };
}

function normalizeFieldSource(sourceType: string): FieldSource {
  switch (sourceType.toLowerCase()) {
    case 'his': return 'his';
    case 'emr': return 'emr';
    case 'asr': return 'asr';
    case 'lis': return 'lis';
    case 'pacs': return 'pacs';
    case 'manual': return 'manual';
    case 'option': return 'option';
    case 'ai':
    case 'icd': return 'ai';
    default: return 'manual';
  }
}

function readOnlyHintOf(_field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): string {
  return [
    value?.errorMessage,
    ...(value?.warnings ?? []),
    ...sourceStatusHints(value),
  ].filter((item): item is string => Boolean(item?.trim())).filter(uniqueText).join('；');
}

function sourceStatusHints(value?: RuntimeFieldValueDto): string[] {
  return value?.sourceStatuses
    ?.filter((status) => status.status !== 'success' && status.message)
    .map((status) => `${status.sourceSystem}: ${status.message}`) ?? [];
}

function uniqueText(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function runtimeValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => arrayItemToText(item, index)).filter(Boolean).join('；');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return '';
}

function arrayItemToText(value: unknown, index: number): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRuntimeIcdCandidate(value)) {
    return `${index + 1}. ${value.diagnosisName}${value.icdCode ? ` [${value.icdCode}]` : ''}`;
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return '';
}

function isRuntimeIcdCandidate(value: unknown): value is RuntimeIcdCandidateDto {
  return (
    typeof value === 'object'
    && value !== null
    && 'diagnosisName' in value
  );
}

function byFieldOrder(a: RuntimeDocFieldDto, b: RuntimeDocFieldDto): number {
  return (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0);
}

function parseDateOnly(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

function todayDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function emptyRuntimeValues(docCode: string, patientIdHis: string): RuntimeDocValueBundleDto {
  return {
    docCode,
    patientIdHis,
    values: {},
    icdCandidates: [],
    pulledSources: [],
    resolvedAt: new Date().toISOString(),
  };
}
