import { invoke } from '@tauri-apps/api/core';
import { medicalTerms } from './samples/terms';
import { isTauriRuntime } from './windowMode';

export type BsEditAssistTrigger = 'focus' | 'input' | 'selection';
export type EditAssistSuggestionType = 'term' | 'phrase' | 'rewrite';
export type EditAssistSuggestionSource = 'terms' | 'mock-ai';

export interface BsEditAssistContext {
  source: 'demo-bs' | (string & {});
  patientId: string;
  patientName: string;
  docCode: 'DOC010' | (string & {});
  docName: string;
  fieldKey: string;
  fieldLabel: string;
  fieldValue: string;
  selectedText: string;
  prefix: string;
  selectionStart: number;
  selectionEnd: number;
  trigger: BsEditAssistTrigger | (string & {});
  detectedAt: string;
  receivedAt: string;
}

export interface EditAssistSuggestion {
  id: string;
  type: EditAssistSuggestionType;
  text: string;
  source: EditAssistSuggestionSource;
}

export const EDIT_ASSIST_CONTEXT_MAX_AGE_MS = 10_000;
const MIN_TOKEN_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

const FIELD_PHRASES: Record<string, string[]> = {
  admissionCondition: [
    '患者因胸痛胸闷入院，症状与活动相关，休息后可部分缓解。',
    '入院时神志清楚，生命体征平稳，诉心前区不适。',
    '结合症状、体征及辅助检查，考虑冠心病相关事件可能。',
  ],
  admissionDiagnosis: [
    '冠状动脉粥样硬化性心脏病',
    '不稳定型心绞痛',
    '高血压病3级（很高危）',
  ],
  treatmentCourse: [
    '入院后予以抗血小板、调脂稳定斑块及改善心肌供血等治疗。',
    '治疗期间动态观察生命体征及心电变化，症状较前改善。',
    '住院期间未再出现持续性胸痛，治疗过程顺利。',
  ],
  dischargeDiagnosis: [
    '冠状动脉粥样硬化性心脏病（I25.101）',
    '不稳定型心绞痛',
    '冠状动脉支架植入术后状态',
  ],
  dischargeCondition: [
    '患者一般情况可，生命体征平稳，未诉明显胸痛、胸闷。',
    '症状较入院时明显缓解，饮食睡眠可，具备出院条件。',
    '病情平稳，无持续性胸痛及气促等不适。',
  ],
  dischargeOrders: [
    '出院后遵医嘱规律服药，门诊定期随诊。',
    '低盐低脂饮食，避免劳累及情绪激动。',
    '如出现胸痛、胸闷、气促等不适，请及时急诊就诊。',
    '1-2周心内科门诊复诊，复查心电图、血脂及肝肾功能。',
  ],
};

const GENERAL_PHRASES = [
  '目前一般情况可，生命体征平稳。',
  '症状较前缓解，继续观察病情变化。',
  '建议遵医嘱规律服药，定期门诊复查。',
  '如有不适及时就诊。',
];

export async function getLatestBsEditAssistContext(): Promise<BsEditAssistContext | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await invoke<BsEditAssistContext | null>('get_latest_bs_edit_assist_context');
  } catch {
    return null;
  }
}

export async function clearLatestBsEditAssistContext() {
  if (!isTauriRuntime()) return;
  try {
    await invoke('clear_latest_bs_edit_assist_context');
  } catch {
    // 清理失败不影响候选面板关闭。
  }
}

export function isUsableEditAssistContext(
  context: BsEditAssistContext | null,
  now = Date.now(),
): context is BsEditAssistContext {
  if (!context) return false;
  if (context.source !== 'demo-bs' || context.docCode !== 'DOC010') return false;
  if (!context.fieldKey || !context.fieldLabel) return false;
  if (isEditAssistContextStale(context, now)) return false;
  return getEditAssistToken(context).length >= MIN_TOKEN_LENGTH;
}

export function isEditAssistContextStale(context: Pick<BsEditAssistContext, 'receivedAt' | 'detectedAt'>, now = Date.now()) {
  const timestamp = Date.parse(context.receivedAt || context.detectedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > EDIT_ASSIST_CONTEXT_MAX_AGE_MS;
}

export function getEditAssistToken(context: Pick<BsEditAssistContext, 'selectedText' | 'prefix'>) {
  return (context.selectedText || context.prefix || '').trim();
}

export function getEditAssistModeLabel(context: BsEditAssistContext) {
  return context.selectedText.trim() ? '替换候选' : '术语/续写';
}

export function buildEditAssistSuggestions(
  context: BsEditAssistContext,
  batchIndex = 0,
): EditAssistSuggestion[] {
  const token = getEditAssistToken(context);
  if (token.length < MIN_TOKEN_LENGTH) return [];

  const terms = buildTermSuggestions(token);
  const phrases = context.selectedText.trim()
    ? buildRewriteSuggestions(context.fieldKey, batchIndex)
    : buildPhraseSuggestions(context.fieldKey, token, batchIndex);

  return uniqueSuggestions([...terms, ...phrases]).slice(0, MAX_SUGGESTIONS);
}

export async function copyEditAssistSuggestion(text: string) {
  if (isTauriRuntime()) {
    await invoke('set_clipboard_text', { text });
    return;
  }

  await navigator.clipboard.writeText(text);
}

function buildTermSuggestions(token: string): EditAssistSuggestion[] {
  const starts = medicalTerms.filter((term) => term !== token && term.startsWith(token));
  const includes = medicalTerms.filter((term) => term !== token && !term.startsWith(token) && term.includes(token));
  return [...starts, ...includes].map((text, index) => ({
    id: `term-${index}-${text}`,
    type: 'term' as const,
    text,
    source: 'terms' as const,
  }));
}

function buildPhraseSuggestions(fieldKey: string, token: string, batchIndex: number): EditAssistSuggestion[] {
  const source = FIELD_PHRASES[fieldKey] ?? GENERAL_PHRASES;
  return rotate(source, batchIndex)
    .filter((phrase) => phrase.includes(token) || token.length >= MIN_TOKEN_LENGTH)
    .map((text, index) => ({
      id: `phrase-${batchIndex}-${index}`,
      type: 'phrase' as const,
      text,
      source: 'mock-ai' as const,
    }));
}

function buildRewriteSuggestions(fieldKey: string, batchIndex: number): EditAssistSuggestion[] {
  const source = FIELD_PHRASES[fieldKey] ?? GENERAL_PHRASES;
  return rotate(source, batchIndex).map((text, index) => ({
    id: `rewrite-${batchIndex}-${index}`,
    type: 'rewrite' as const,
    text,
    source: 'mock-ai' as const,
  }));
}

function uniqueSuggestions(items: EditAssistSuggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
}

function rotate<T>(items: T[], batchIndex: number) {
  if (items.length === 0) return [];
  const offset = Math.abs(batchIndex) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
