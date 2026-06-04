// 临床数据与 AI 能力服务。
//
// 聚合「客观数据拉取 / 语音转写 / ICD 推荐 / 质控 / 草稿生成」等能力，
// 供范式工作流调用。当前为样例实现（数据源见 ./samples），后端就绪后替换。
// TODO: 各方法替换为真实接口（LIS/PACS、ASR、AI 推理服务）。

import {
  admissionObjective,
  admissionTranscript,
  admissionIcd,
  admissionQc,
} from './samples/admission';
import { docTemplates } from './samples/templates';
import { medicalTerms } from './samples/terms';
import type {
  ObjectiveItem,
  TranscriptSegment,
  IcdItem,
  QcResult,
  DocTemplate,
  DocFieldDef,
  FieldValue,
  RenderedDoc,
  RenderedSection,
} from './types';

/** 拉取患者近期 LIS 检验 / PACS 影像客观指标 */
export async function getObjectiveData(_patientId: string): Promise<ObjectiveItem[]> {
  return admissionObjective;
}

/** 语音转写（床旁问诊录音 → 文本，含 PII 脱敏占位） */
export async function transcribe(_patientId: string): Promise<TranscriptSegment[]> {
  return admissionTranscript;
}

/** ICD-10 诊断推荐 */
export async function recommendIcd(_patientId: string): Promise<IcdItem[]> {
  return admissionIcd;
}

/** 病历三级质控 */
export async function runQc(_patientId: string, _content: string): Promise<QcResult> {
  return admissionQc;
}

// ==================== 模板驱动的成稿渲染（单一数据源） ====================

/** 按文书编码拉取字段模板（后台可配置下发；当前样例实现） */
export async function getDocTemplate(docCode: string): Promise<DocTemplate | null> {
  return docTemplates[docCode] ?? null;
}

/** 渲染单个字段为病历正文文本 */
function renderField(field: DocFieldDef, value: FieldValue | undefined): string {
  switch (field.inputType) {
    case 'static':
      // 医生可在要素核对步编辑 static 字段；有编辑值则优先，否则用模板默认文本
      return (value as string) ?? field.staticText ?? '';
    case 'options': {
      const v = (value as string) ?? field.default ?? '';
      return field.options?.find((o) => o.value === v)?.render ?? '';
    }
    case 'text':
      return ((value as string) ?? field.default ?? '').trim();
    case 'icd': {
      const list = (value as IcdItem[]) ?? [];
      return list.length ? list.map((d, i) => `${i + 1}. ${d.name} [${d.code}]`).join('；') : '暂无';
    }
    default:
      return '';
  }
}

/**
 * 模板 + 要素值 → 成稿（单一数据源）。
 * 正文与落库结构化字段均由同一份「段落 → 文本」映射派生，
 * 从根本上杜绝"屏上正文 ≠ 落库字段"的双轨拼装问题。
 */
export function renderDocument(
  template: DocTemplate,
  values: Record<string, FieldValue>,
): RenderedDoc {
  // 按字段声明顺序聚合到所属段落
  const order: string[] = [];
  const map = new Map<string, string[]>();
  for (const f of template.fields) {
    const text = renderField(f, values[f.key]);
    if (!text) continue;
    if (!map.has(f.section)) {
      map.set(f.section, []);
      order.push(f.section);
    }
    map.get(f.section)!.push(text);
  }
  const sections: RenderedSection[] = order.map((s) => ({ section: s, text: map.get(s)!.join('') }));
  const content = sections.map((s) => `【${s.section}】${s.text}`).join('\n');
  const fields = Object.fromEntries(sections.map((s) => [s.section, s.text]));
  return { sections, content, fields };
}

/**
 * 医疗术语 / 句式输入联想（成稿编辑时的"输入时提示"）。
 * 当前样例：从术语库按前缀匹配（startsWith 优先、includes 兜底）；
 * 真实环境接后端术语服务 / AI 联想（可按科室、文书类型下发词库）。
 */
export async function suggestTerms(prefix: string): Promise<string[]> {
  const p = prefix.trim();
  if (p.length < 2) return [];
  const starts = medicalTerms.filter((t) => t !== p && t.startsWith(p));
  const includes = medicalTerms.filter((t) => t !== p && !t.startsWith(p) && t.includes(p));
  return [...starts, ...includes].slice(0, 6);
}
