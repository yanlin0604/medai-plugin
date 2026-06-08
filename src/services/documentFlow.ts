import type {
  ClinicalSection,
  DocumentSubmitSnapshot,
  Patient,
  PatientBrief,
} from './types';

interface BuildSubmitSnapshotOptions {
  sections: ClinicalSection[];
  sectionEdits?: Record<string, string>;
  changeSummary: string;
  includeEmptySections?: boolean;
}

function resolveSectionText(section: ClinicalSection, sectionEdits?: Record<string, string>): string {
  const edited = sectionEdits?.[section.key] ?? sectionEdits?.[section.title];
  return (edited ?? section.text).trim();
}

/** 将段落列表渲染为统一正文，供屏幕预览、草稿保存和版本快照共用。 */
export function buildSectionContent(
  sections: ClinicalSection[],
  sectionEdits?: Record<string, string>,
  includeEmptySections = false,
): string {
  return sections
    .map((section) => ({
      title: section.title,
      text: resolveSectionText(section, sectionEdits),
    }))
    .filter((section) => includeEmptySections || section.text)
    .map((section) => `【${section.title}】${section.text}`)
    .join('\n');
}

/** 将段落列表转换为提交前快照，保证正文和结构化字段同源。 */
export function buildSubmitSnapshot({
  sections,
  sectionEdits,
  changeSummary,
  includeEmptySections = false,
}: BuildSubmitSnapshotOptions): DocumentSubmitSnapshot {
  const effectiveSections = sections
    .map((section) => ({
      ...section,
      text: resolveSectionText(section, sectionEdits),
    }))
    .filter((section) => includeEmptySections || section.text);

  return {
    fields: Object.fromEntries(effectiveSections.map((section) => [section.fieldKey, section.text])),
    fieldLabels: Object.fromEntries(effectiveSections.map((section) => [section.fieldKey, section.title])),
    fieldOrder: effectiveSections.map((section) => section.fieldKey),
    content: buildSectionContent(effectiveSections, undefined, includeEmptySections),
    changeSummary,
  };
}

/** 将当前患者 store 数据转换为临床组件通用患者简要信息。 */
export function resolvePatientBrief(patient: Patient | PatientBrief): PatientBrief {
  if ('admissionNo' in patient) return patient;
  return {
    name: patient.name,
    gender: patient.gender,
    age: patient.age,
    bed: patient.bedNo,
    admissionNo: patient.id,
    diagnosis: patient.diagnosis,
  };
}

/** 按 key 更新段落正文，保持数组顺序不变。 */
export function updateSectionText(
  sections: ClinicalSection[],
  sectionKey: string,
  text: string,
): ClinicalSection[] {
  return sections.map((section) => (section.key === sectionKey ? { ...section, text } : section));
}

/** 生成短提交按钮文案，避免主按钮过长。 */
export function buildSubmitLabel(docName: string): string {
  return `提交${docName}`;
}
