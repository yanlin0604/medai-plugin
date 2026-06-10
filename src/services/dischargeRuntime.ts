import type { DocumentPaperMetaCell } from '../components/clinical/DocumentPaper';
import type { PatientBrief } from '../components/clinical/EmrContextCard';
import type { ClinicalSection, FieldSource, IcdItem } from './types';
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

const MAX_META_CELLS_PER_ROW = 3;

export async function loadDischargeRuntime(
  docCode: string,
  patientIdHis: string,
  patient: PatientBrief,
): Promise<DischargeRuntimeState> {
  const [template, values] = await Promise.all([
    pluginRuntimeApi.getRuntimeTemplate(docCode),
    pluginRuntimeApi.resolveRuntimeValues(docCode, patientIdHis),
  ]);
  return buildDischargeRuntime(template, values, patient);
}

export function buildDischargeRuntime(
  template: RuntimeDocTemplateDto,
  values: RuntimeDocValueBundleDto,
  patient: PatientBrief,
): DischargeRuntimeState {
  validateRuntimeConfig(template, values);
  const sortedFields = [...template.fields].sort(byFieldOrder);
  const fieldValues = values.values ?? {};
  const sections = sortedFields.map((field) => toClinicalSection(field, fieldValues[field.fieldKey]));
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

export function isDischargeMetaSection(section: ClinicalSection, metaFieldKeys: string[]): boolean {
  return metaFieldKeys.includes(section.key);
}

function toClinicalSection(field: RuntimeDocFieldDto, value?: RuntimeFieldValueDto): ClinicalSection {
  return {
    key: field.fieldKey,
    title: field.sectionName || field.fieldLabel,
    text: resolveFieldText(field, value),
    fieldKey: field.writebackFieldKey || field.fieldKey,
    editable: field.renderRule?.editable ?? true,
    source: normalizeFieldSource(field.sourceType),
    required: Boolean(field.required),
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
  return field.staticText || field.defaultValue || '';
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
  return value?.errorMessage || field.renderRule?.readOnlyHint || '';
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
