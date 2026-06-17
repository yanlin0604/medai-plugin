import type { FieldAssistContext, FieldAssistDraft, FieldAssistIntent } from './types';
import { getFieldAssistContextKey } from './types';

const MIN_PREFIX_LENGTH = 2;

export function resolveFieldAssistIntent(
  context: FieldAssistContext,
  draft?: FieldAssistDraft | null,
): FieldAssistIntent {
  if (context.selectedText.trim()) return 'rewrite';
  if (context.trigger === 'input' && context.prefix.trim().length >= MIN_PREFIX_LENGTH) return 'term';
  if (!context.fieldValue.trim()) return 'autoGenerate';
  if (draft && draft.contextKey === getFieldAssistContextKey(context)) return 'draftReady';
  return 'idle';
}

export function shouldAutoGenerateField(
  context: FieldAssistContext,
  draft?: FieldAssistDraft | null,
) {
  return resolveFieldAssistIntent(context, draft) === 'autoGenerate'
    && (!draft || draft.contextKey !== getFieldAssistContextKey(context));
}
