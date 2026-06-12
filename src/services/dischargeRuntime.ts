import type { DocumentPaperMetaCell } from '../components/clinical/DocumentPaper';
import type { PatientBrief } from '../components/clinical/EmrContextCard';
import type { ClinicalFieldCalculation, ClinicalSection, FieldSource, IcdItem } from './types';
import { pluginRuntimeApi, toIcdItem } from './pluginRuntime';
import type {
  RuntimeDocFieldDto,
  RuntimeDocTemplateDto,
  RuntimeDocValueBundleDto,
  RuntimeFieldValueDto,
  RuntimeIcdCandidateDto,
} from './pluginRuntimeTypes';

export interface DischargeRuntimeState {
  template: RuntimeDocTemplateDto;
  values: RuntimeDocValueBundleDto;
  sections: ClinicalSection[];
  metaRows: DocumentPaperMetaCell[][];
  metaFieldKeys: string[];
  readOnlyHints: Record<string, string>;
  icdCandidates: IcdItem[];
}

export interface DischargeRuntimeFieldState {
  values: RuntimeDocValueBundleDto;
  section: ClinicalSection;
  readOnlyHint: string;
  icdCandidates: IcdItem[];
}

const MAX_META_CELLS_PER_ROW = 3;
const runtimeCache = new Map<string, Promise<DischargeRuntimeState>>();

interface LoadDischargeRuntimeOptions {
  forceRefresh?: boolean;
}

function runtimeCacheKey(docCode: string, patientIdHis: string): string {
  return `${docCode}:${patientIdHis}`;
}

export function clearDischargeRuntimeCache(docCode?: string, patientIdHis?: string): void {
  if (!docCode || !patientIdHis) {
    runtimeCache.clear();
    return;
  }

  runtimeCache.delete(runtimeCacheKey(docCode, patientIdHis));
}

export async function loadDischargeRuntime(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
  options: LoadDischargeRuntimeOptions = {},
): Promise<DischargeRuntimeState> {
  const cacheKey = runtimeCacheKey(docCode, patientIdHis);
  if (options.forceRefresh) {
    runtimeCache.delete(cacheKey);
  }

  let promise = runtimeCache.get(cacheKey);
  if (!promise) {
    promise = Promise.all([
      pluginRuntimeApi.getRuntimeTemplate(docCode),
      pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis),
    ])
      .then(([template, values]) => buildDischargeRuntime(template, values, patient))
      .catch((error) => {
        runtimeCache.delete(cacheKey);
        throw error;
      });
    runtimeCache.set(cacheKey, promise);
  }

  return promise;
}

export async function loadDischargeRuntimeTemplate(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
): Promise<DischargeRuntimeState> {
  const template = await pluginRuntimeApi.getRuntimeTemplate(docCode);
  return buildDischargeRuntime(template, emptyRuntimeValues(docCode, patientIdHis), patient);
}

export async function loadDischargeRuntimeValues(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
  template: RuntimeDocTemplateDto,
): Promise<DischargeRuntimeState> {
  const values = await pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis);
  const runtime = buildDischargeRuntime(template, values, patient);
  runtimeCache.set(runtimeCacheKey(docCode, patientIdHis), Promise.resolve(runtime));
  return runtime;
}

export async function loadDischargeRuntimeField(
  docCode: string,
  patientIdHis: string,
  fieldKey: string,
  template: RuntimeDocTemplateDto,
): Promise<DischargeRuntimeFieldState> {
  const values = await pluginRuntimeApi.resolveRuntimeFieldValue(docCode, patientIdHis, fieldKey);
  return buildDischargeRuntimeField(template, values, fieldKey);
}

export function buildDischargeRuntime(
  template: RuntimeDocTemplateDto,
  values: RuntimeDocValueBundleDto,
  patient: PatientBrief,
): DischargeRuntimeState {
  validateRuntimeConfig(template, values);
  const sortedFields = [...template.fields].sort(byFieldOrder);
  const fieldValues = values.values ?? {};
  const sections = applyDischargeFieldAutomation(
    sortedFields.map((field) => toClinicalSection(field, fieldValues[field.fieldKey])),
  );
  const metaFields = sortedFields.filter(isMetaField);
  const metaFieldKeys = metaFields.map((field) => field.fieldKey);
  const readOnlyHints = Object.fromEntries(
    sortedFields
      .map((field) => [field.fieldKey, readOnlyHintOf(field, fieldValues[field.fieldKey])] as const)
      .filter(([, hint]) => Boolean(hint)),
  );

  return {
    template,
    values,
    sections,
    metaRows: buildDischargeMetaRows(patient, metaFields, values),
    metaFieldKeys,
    readOnlyHints,
    icdCandidates: values.icdCandidates?.map(toIcdItem) ?? [],
  };
}

export function buildDischargeRuntimeField(
  template: RuntimeDocTemplateDto,
  values: RuntimeDocValueBundleDto,
  fieldKey: string,
): DischargeRuntimeFieldState {
  validateRuntimeConfig(template, values);
  const field = template.fields.find((item) => item.fieldKey === fieldKey);
  if (!field) {
    throw new Error(`后台出院记录模板未配置字段：${fieldKey}`);
  }
  const value = values.values?.[fieldKey];

  return {
    values,
    section: toClinicalSection(field, value),
    readOnlyHint: readOnlyHintOf(field, value),
    icdCandidates: values.icdCandidates?.map(toIcdItem) ?? [],
  };
}

export function isDischargeMetaSection(section: ClinicalSection, metaFieldKeys: string[]): boolean {
  return metaFieldKeys.includes(section.key);
}

function toClinicalSection(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): ClinicalSection {
  const dateField = isStandardDischargeDateField(field.fieldKey);
  const daysField = field.fieldKey === 'hospitalDays';
  return {
    key: field.fieldKey,
    title: field.sectionName || field.fieldLabel,
    text: resolveFieldText(field, value),
    fieldKey: field.writebackFieldKey || field.fieldKey,
    editable: daysField ? false : dateField ? true : field.renderRule?.editable ?? true,
    inputType: dateField ? 'date' : field.inputType,
    calculation: field.renderRule?.calculation ?? defaultDischargeCalculation(field.fieldKey),
    source: normalizeFieldSource(field.sourceType),
    required: Boolean(field.required),
    evidenceEnabled: Boolean(field.renderRule?.evidence?.enabled),
  };
}

function validateRuntimeConfig(template: RuntimeDocTemplateDto, values: RuntimeDocValueBundleDto) {
  if (!template.fields?.length) {
    throw new Error('后台出院记录模板未配置字段');
  }
  if (values.docCode && template.docCode && values.docCode !== template.docCode) {
    throw new Error('后台出院记录模板与字段取值文书编码不一致');
  }

  const fieldKeys = new Set<string>();
  const writebackKeys = new Set<string>();
  template.fields.forEach((field, index) => {
    const fieldName = field.fieldLabel || field.sectionName || `第${index + 1}个字段`;
    if (!field.fieldKey?.trim()) {
      throw new Error(`后台出院记录模板字段「${fieldName}」未配置字段键`);
    }
    if (!field.fieldLabel?.trim() && !field.sectionName?.trim()) {
      throw new Error(`后台出院记录模板字段「${field.fieldKey}」未配置展示名称`);
    }
    if (fieldKeys.has(field.fieldKey)) {
      throw new Error(`后台出院记录模板字段键重复：${field.fieldKey}`);
    }
    fieldKeys.add(field.fieldKey);

    const writebackKey = field.writebackFieldKey || field.fieldKey;
    if (!writebackKey.trim()) {
      throw new Error(`后台出院记录模板字段「${fieldName}」未配置回写字段键`);
    }
    if (writebackKeys.has(writebackKey)) {
      throw new Error(`后台出院记录模板回写字段键重复：${writebackKey}`);
    }
    writebackKeys.add(writebackKey);
  });
}

function isMetaField(field: RuntimeDocFieldDto): boolean {
  const slot = field.renderRule?.metaSlot;
  return slot === 'patient' || slot === 'date';
}

function resolveFieldText(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): string {
  const resolved = runtimeValueToText(value?.value);
  if (resolved) return resolved;
  if (field.renderRule?.defaultValueMode === 'today') return todayDate();
  return field.staticText || field.defaultValue || '';
}

function isStandardDischargeDateField(fieldKey: string): boolean {
  return fieldKey === 'admissionDate' || fieldKey === 'dischargeDate';
}

function defaultDischargeCalculation(fieldKey: string): ClinicalFieldCalculation | undefined {
  if (fieldKey !== 'hospitalDays') return undefined;
  return {
    type: 'daysBetween',
    startField: 'admissionDate',
    endField: 'dischargeDate',
    minDays: 1,
    suffix: '天',
  };
}

export function applyDischargeFieldAutomation(sections: ClinicalSection[]): ClinicalSection[] {
  const values = Object.fromEntries(sections.map((section) => [section.key, section.text]));
  return sections.map((section) => {
    const calculated = calculateSectionText(section.calculation ?? defaultDischargeCalculation(section.key), values);
    return calculated == null ? section : { ...section, text: calculated };
  });
}

function calculateSectionText(
  calculation: ClinicalFieldCalculation | undefined,
  values: Record<string, string>,
): string | null {
  if (calculation?.type !== 'daysBetween' || !calculation.startField || !calculation.endField) return null;
  const days = calculateHospitalDays(values[calculation.startField], values[calculation.endField], calculation.minDays);
  if (days == null) return '';
  return `${days}${calculation.suffix ?? '天'}`;
}

export function calculateHospitalDays(startDate: string, endDate: string, minDays = 1): number | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (diffDays < 0) return null;
  return Math.max(minDays, diffDays);
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

function buildDischargeMetaRows(
  patient: PatientBrief,
  metaFields: RuntimeDocFieldDto[],
  values: RuntimeDocValueBundleDto,
): DocumentPaperMetaCell[][] {
  const rows: DocumentPaperMetaCell[][] = [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位号', value: patient.bed },
      { label: '住院号', value: patient.admissionNo },
      { label: '入院诊断', value: patient.diagnosis ?? '待完善' },
    ],
  ];

  const configuredCells = metaFields.map((field) => ({
    label: field.fieldLabel,
    value: runtimeValueToText(values.values?.[field.fieldKey]?.value) || '待同步',
  }));

  for (let index = 0; index < configuredCells.length; index += MAX_META_CELLS_PER_ROW) {
    rows.push(configuredCells.slice(index, index + MAX_META_CELLS_PER_ROW));
  }

  return rows;
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

function readOnlyHintOf(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): string {
  return [
    value?.errorMessage,
    ...(value?.warnings ?? []),
    ...sourceStatusHints(value),
    field.renderRule?.readOnlyHint,
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

function normalizeFieldSource(sourceType: string): FieldSource {
  switch (sourceType.toLowerCase()) {
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
    case 'option':
      return 'option';
    case 'ai':
    case 'icd':
      return 'ai';
    default:
      return 'manual';
  }
}

function byFieldOrder(a: RuntimeDocFieldDto, b: RuntimeDocFieldDto): number {
  return (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0);
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
