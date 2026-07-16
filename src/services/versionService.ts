import type { DocVersion, SectionDiff } from './types';
import { pluginRuntimeApi } from './pluginRuntime';
import type { RuntimeCreateVersionRequest } from './pluginRuntimeTypes';
import { HM_DISCHARGE_ORDERS_FIELD_KEY } from '../config/hmFieldKeys';

const KEY_PREFIX = 'medai:versions:';
const keyOf = (docCode: string, patientId: string) => `${KEY_PREFIX}${docCode}:${patientId}`;

export type VersionSnapshotInput = Omit<DocVersion, 'versionNo'>;

export interface DocumentVersionAdapter {
  listVersions: (docCode: string, patientId: string) => Promise<DocVersion[]>;
  createVersion: (snapshot: VersionSnapshotInput) => Promise<DocVersion>;
}

const VERSION_FIELD_LABELS: Record<string, Record<string, string>> = {
  DOC001: {
    patientInfo: '患者基本信息',
    chiefComplaint: '主诉',
    presentIllness: '现病史',
    pastHistory: '既往史',
    personalHistory: '个人史',
    familyHistory: '家族史',
    examPositive: '体格检查阳性发现',
    examVitals: '生命体征 / 心肺查体',
    specialExam: '专科检查',
    labExam: '检验结果',
    imagingExam: '影像 / 心电图',
    diagnoses: '初步诊断',
    treatmentPlan: '诊疗计划',
  },
  DOC010: {
    patientInfo: '患者基本信息',
    maritalStatus: '婚姻',
    occupation: '职业',
    birthPlace: '出生地',
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
  },
};

function resolveFieldLabel(version: DocVersion, fieldKey: string): string {
  return version.fieldLabels?.[fieldKey] ?? VERSION_FIELD_LABELS[version.docCode]?.[fieldKey] ?? fieldKey;
}

function readLocal(docCode: string, patientId: string): DocVersion[] {
  try {
    const raw = localStorage.getItem(keyOf(docCode, patientId));
    return raw ? (JSON.parse(raw) as DocVersion[]) : [];
  } catch {
    return [];
  }
}

/** 读取版本历史（样例历史 + 本地追加），按版本号倒序 */
export function getDocVersions(docCode: string, patientId: string): DocVersion[] {
  const all = readLocal(docCode, patientId);
  return all.sort((a, b) => b.versionNo - a.versionNo);
}

/** 追加一个版本快照（提交时调用），版本号自动递增，返回新版本 */
export function appendVersion(
  snapshot: Omit<DocVersion, 'versionNo'>,
): DocVersion {
  const existing = getDocVersions(snapshot.docCode, snapshot.patientId);
  const nextNo = existing.length ? existing[0].versionNo + 1 : 1;
  const version: DocVersion = { ...snapshot, versionNo: nextNo };
  try {
    const local = readLocal(snapshot.docCode, snapshot.patientId);
    local.push(version);
    localStorage.setItem(keyOf(snapshot.docCode, snapshot.patientId), JSON.stringify(local));
  } catch {
    // ignore
  }
  return version;
}

export async function listRuntimeDocVersions(docCode: string, patientId: string): Promise<DocVersion[]> {
  return pluginRuntimeApi.listDocVersions(docCode, patientId);
}

export async function createRuntimeDocVersion(snapshot: VersionSnapshotInput): Promise<DocVersion> {
  const request: RuntimeCreateVersionRequest = {
    patientIdHis: snapshot.patientId,
    content: snapshot.content,
    fields: snapshot.fields,
    fieldLabels: snapshot.fieldLabels,
    fieldOrder: snapshot.fieldOrder,
    editor: snapshot.editor,
    changeSummary: snapshot.changeSummary,
  };
  return pluginRuntimeApi.createDocVersion(snapshot.docCode, request);
}

export const localVersionAdapter: DocumentVersionAdapter = {
  listVersions: async (docCode, patientId) => getDocVersions(docCode, patientId),
  createVersion: async (snapshot) => appendVersion(snapshot),
};

export const backendRuntimeVersionAdapter: DocumentVersionAdapter = {
  listVersions: listRuntimeDocVersions,
  createVersion: createRuntimeDocVersion,
};

/** 计算两版本按段落的差异（older → newer） */
export function getVersionDiff(older: DocVersion, newer: DocVersion): SectionDiff[] {
  const sections = Array.from(
    new Set([
      ...(newer.fieldOrder ?? []),
      ...(older.fieldOrder ?? []),
      ...Object.keys(older.fields),
      ...Object.keys(newer.fields),
    ]),
  );
  return sections.map((section) => {
    const before = older.fields[section] ?? '';
    const after = newer.fields[section] ?? '';
    return { section: resolveFieldLabel(newer, section), before, after, changed: before !== after };
  });
}
