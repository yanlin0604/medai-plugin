import { saveDraft } from './draftService';
import { submitDocument } from './emsBridge';
import {
  loadDischargeRuntime,
  type DischargeRuntimeContext,
  type DischargeRuntimeState,
} from './dischargeRuntime';
import { buildSubmitSnapshot, resolvePatientBrief } from './documentFlow';
import { backendRuntimeVersionAdapter, type DocumentVersionAdapter } from './versionService';
import type { DocumentPayload, FieldValue, Patient, SubmitResult } from './types';
import { HM_DISCHARGE_ORDERS_FIELD_KEY } from '../config/hmFieldKeys';

const DISCHARGE_DOC_CODE = 'DOC010';
const CHANGE_SUMMARY = '助手气泡回写出院记录';

const SHELL_FIELD_LABELS: Record<string, string> = {
  patientInfo: '患者基本信息',
  admissionDate: '入院日期',
  dischargeDate: '出院日期',
  hospitalDays: '住院天数',
  admissionCondition: '入院情况',
  admissionDiagnosis: '入院诊断',
  treatmentCourse: '诊疗经过',
  dischargeDiagnosis: '出院诊断',
  dischargeCondition: '出院情况',
  [HM_DISCHARGE_ORDERS_FIELD_KEY]: '出院医嘱',
  physicianSignature: '医师签名',
};

const BUBBLE_REQUIRED_SECTION_KEYS = new Set([
  'admissionCondition',
  'admissionDiagnosis',
  'treatmentCourse',
  'dischargeDiagnosis',
  'dischargeCondition',
  HM_DISCHARGE_ORDERS_FIELD_KEY,
]);
const BUBBLE_REQUIRED_SECTION_TITLES = new Set([
  '入院情况',
  '入院诊断',
  '诊疗经过',
  '出院诊断',
  '出院情况',
  '出院医嘱',
]);
const BUBBLE_META_SECTION_KEYS = new Set(['admissionDate', 'dischargeDate', 'hospitalDays']);

export interface BubbleDischargeDraft {
  payload: DocumentPayload;
  draftValues: Record<string, FieldValue>;
  missingFields: string[];
}

interface BuildBubbleDischargeDraftDeps {
  loadRuntime?: typeof loadDischargeRuntime;
  forceRefresh?: boolean;
}

interface SubmitBubbleDischargeDraftDeps extends BuildBubbleDischargeDraftDeps {
  writeback?: (payload: DocumentPayload) => Promise<SubmitResult>;
  versionAdapter?: DocumentVersionAdapter;
  save?: typeof saveDraft;
  now?: () => string;
  preparedDraft?: BubbleDischargeDraft;
}

export interface BubbleDischargeWritebackResult extends SubmitResult {
  written: boolean;
  historyCreated: boolean;
}

function formatPatientInfo(patient: Patient): string {
  return `姓名：${patient.name}；性别：${patient.gender}；年龄：${patient.age}；床号：${patient.bedNo}；住院号：${patient.id}；科室：${patient.deptName}；入院日期：${patient.admissionDate}；主管医生：${patient.doctor}；诊断：${patient.diagnosis}`;
}

/** 医生/科室上下文：后端据此匹配 doctor/dept 级组合字段模板与配置默认值 */
function toRuntimeContext(patient: Patient): DischargeRuntimeContext {
  return {
    doctorCode: patient.doctor,
    doctorName: patient.doctor,
    deptCode: patient.deptName,
    clientId: 'medai-plugin',
  };
}

function uniqueOrder(...groups: Array<Array<string | undefined>>): string[] {
  const seen = new Set<string>();
  return groups.flat().filter((key): key is string => {
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addDemoBsShellFields(
  patient: Patient,
  snapshot: Pick<DocumentPayload, 'fields' | 'fieldLabels' | 'fieldOrder'>,
): Pick<DocumentPayload, 'fields' | 'fieldLabels' | 'fieldOrder'> {
  const fields = {
    patientInfo: formatPatientInfo(patient),
    ...snapshot.fields,
    physicianSignature: patient.doctor,
  };

  return {
    fields,
    fieldLabels: {
      patientInfo: SHELL_FIELD_LABELS.patientInfo,
      ...snapshot.fieldLabels,
      physicianSignature: SHELL_FIELD_LABELS.physicianSignature,
    },
    fieldOrder: uniqueOrder(['patientInfo'], snapshot.fieldOrder ?? Object.keys(snapshot.fields), ['physicianSignature']),
  };
}

function getMissingRequiredSectionTitles(runtime: DischargeRuntimeState): string[] {
  const missingSections = runtime.sections.filter(
    (section) => !runtime.metaFieldKeys.includes(section.key)
      && !BUBBLE_META_SECTION_KEYS.has(section.key)
      && (
        section.required
        || BUBBLE_REQUIRED_SECTION_KEYS.has(section.key)
        || BUBBLE_REQUIRED_SECTION_TITLES.has(section.title)
      ) && !section.text.trim(),
  );
  return missingSections.map((section) => section.title);
}

function buildRuntimeDraft(
  patient: Patient,
  docName: string,
  runtime: DischargeRuntimeState,
): BubbleDischargeDraft {
  const snapshot = buildSubmitSnapshot({
    sections: runtime.sections,
    changeSummary: CHANGE_SUMMARY,
    includeEmptySections: true,
  });
  const shellFields = addDemoBsShellFields(patient, snapshot);
  const draftValues: Record<string, FieldValue> = Object.fromEntries(
    runtime.sections
      .filter((section) => section.text.trim())
      .map((section) => [section.key, section.text]),
  );
  draftValues.dischargeDiagnoses = runtime.icdCandidates;

  return {
    payload: {
      docCode: DISCHARGE_DOC_CODE,
      docName,
      patientId: patient.id,
      ...shellFields,
      content: snapshot.content,
    },
    draftValues,
    missingFields: getMissingRequiredSectionTitles(runtime),
  };
}

export async function buildBubbleDischargeDraft(
  patient: Patient,
  docName: string,
  deps: BuildBubbleDischargeDraftDeps = {},
): Promise<BubbleDischargeDraft> {
  const loadRuntime = deps.loadRuntime ?? loadDischargeRuntime;
  try {
    const runtime = await loadRuntime(
      DISCHARGE_DOC_CODE,
      patient.id,
      resolvePatientBrief(patient),
      {
        ...(deps.forceRefresh ? { forceRefresh: true } : {}),
        context: toRuntimeContext(patient),
      },
    );
    return buildRuntimeDraft(patient, docName, runtime);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '后端运行时字段生成失败';
    throw new Error(`字段生成失败，点开处理：${detail}`);
  }
}

export async function submitBubbleDischargeDraft(
  patient: Patient,
  docName: string,
  editor: string,
  deps: SubmitBubbleDischargeDraftDeps = {},
): Promise<BubbleDischargeWritebackResult> {
  const writeback = deps.writeback ?? submitDocument;
  const versionAdapter = deps.versionAdapter ?? backendRuntimeVersionAdapter;
  const persistDraft = deps.save ?? saveDraft;
  const draft = deps.preparedDraft ?? await buildBubbleDischargeDraft(patient, docName, deps);

  const writebackResult = await writeback(draft.payload);
  if (!writebackResult.ok) {
    return {
      ...writebackResult,
      written: false,
      historyCreated: false,
    };
  }

  const timestamp = deps.now ? deps.now() : new Date().toISOString();
  persistDraft({
    docCode: draft.payload.docCode,
    patientId: draft.payload.patientId,
    values: draft.draftValues,
    content: draft.payload.content,
    step: 1,
    status: 'submitted',
    updatedAt: timestamp,
  });

  try {
    await versionAdapter.createVersion({
      docCode: draft.payload.docCode,
      patientId: draft.payload.patientId,
      content: draft.payload.content,
      fields: draft.payload.fields,
      fieldLabels: draft.payload.fieldLabels,
      fieldOrder: draft.payload.fieldOrder,
      editor,
      timestamp,
      changeSummary: CHANGE_SUMMARY,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '历史版本生成失败';
    return {
      ok: false,
      message: `文书已回写，但历史版本生成失败：${detail}`,
      written: true,
      historyCreated: false,
    };
  }

  return {
    ...writebackResult,
    written: true,
    historyCreated: true,
  };
}
