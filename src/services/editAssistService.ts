import { invoke } from '@tauri-apps/api/core';
import { pluginRuntimeApi } from './pluginRuntime';
import type { RuntimeEditAssistType } from './pluginRuntimeTypes';
import { isTauriRuntime } from './windowMode';

export type BsEditAssistTrigger = 'focus' | 'input' | 'selection';
export type EditAssistSuggestionType = 'term' | 'phrase' | 'rewrite';
export type EditAssistSuggestionSource = 'terms' | 'ai';

export interface BsEditAssistContext {
  source: 'demo-bs' | 'demo-cs' | (string & {});
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
  const isValidSource = context.source === 'demo-bs' || context.source === 'demo-cs';
  if (!isValidSource) return false;
  const validDocCodes = new Set(['DOC010', 'DOC013', 'D0C013']);
  if (!validDocCodes.has(context.docCode)) return false;
  if (!context.fieldKey || !context.fieldLabel) return false;
  if (isEditAssistContextStale(context, now)) return false;
  if (getEditAssistToken(context).length >= MIN_TOKEN_LENGTH) return true;
  return context.fieldValue.trim().length >= MIN_TOKEN_LENGTH;
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
  const assistType = resolveEditAssistType(context);
  if (assistType === 'rewrite') return '替换候选';
  return '输入候选';
}

export function resolveEditAssistType(
  context: Pick<BsEditAssistContext, 'selectedText' | 'prefix' | 'fieldValue' | 'trigger'>,
): RuntimeEditAssistType {
  if (context.selectedText.trim()) return 'rewrite';
  return 'continue';
}

export async function fetchEditAssistSuggestions(
  context: BsEditAssistContext,
  batchIndex = 0,
  assistType = resolveEditAssistType(context),
): Promise<EditAssistSuggestion[]> {
  const response = await pluginRuntimeApi.getEditAssistSuggestions({
    patientId: context.patientId,
    docCode: context.docCode,
    docName: context.docName,
    fieldKey: context.fieldKey,
    fieldLabel: context.fieldLabel,
    fieldValue: context.fieldValue,
    selectedText: context.selectedText,
    prefix: context.prefix,
    assistType,
    trigger: context.trigger,
    batchIndex,
  });

  return (response.suggestions ?? []).map((item) => ({
    id: item.id,
    type: normalizeSuggestionType(item.type),
    text: item.text,
    source: normalizeSuggestionSource(item.source),
  }));
}

export async function copyEditAssistSuggestion(text: string) {
  if (isTauriRuntime()) {
    await invoke('set_clipboard_text', { text });
    return;
  }

  await navigator.clipboard.writeText(text);
}

function normalizeSuggestionType(type: string): EditAssistSuggestionType {
  return type === 'term' || type === 'phrase' || type === 'rewrite' ? type : 'phrase';
}

function normalizeSuggestionSource(source: string): EditAssistSuggestionSource {
  return source === 'terms' ? 'terms' : 'ai';
}
