import type { FieldAssistDraft } from './types';

const HISTORY_STORAGE_KEY = 'medaiPlugin.fieldAssistHistory';

function readHistory(): FieldAssistDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FieldAssistDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items: FieldAssistDraft[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
  } catch {
    // 本地历史失败不阻断主流程。
  }
}

export function loadFieldAssistHistory(): FieldAssistDraft[] {
  return readHistory();
}

export function saveFieldAssistDraft(draft: FieldAssistDraft) {
  const next = [draft, ...readHistory().filter((item) => item.response.generationId !== draft.response.generationId)];
  writeHistory(next);
}
