import type { FieldAssistContext, FieldAssistDraft, FieldAssistIntent } from './types';
import { getFieldAssistContextKey } from './types';

export function resolveFieldAssistIntent(
  context: FieldAssistContext,
  _draft?: FieldAssistDraft | null,
): FieldAssistIntent {
  let intent: FieldAssistIntent;
  
  if (context.selectedText.trim()) {
    intent = 'rewrite';
  } else if (!context.fieldValue.trim()) {
    // 如果字段完全为空，无论是刚聚焦还是生成完草稿没回填，都保持在 AI 生成模式（展示草稿卡片）
    intent = 'autoGenerate';
  } else {
    // 只要字段里有了文本（不论是回填进来的，还是医生自己开始敲字的），全部进入术语续写模式
    intent = 'term';
  }

  const intentNames: Record<FieldAssistIntent, string> = {
    rewrite: '划词改写',
    autoGenerate: '自动生成',
    term: '术语/续写',
    draftReady: '待回填草稿',
    idle: '空闲/等待'
  };

  console.log(`[FieldAssist] 当前触发模式: ${intent} (${intentNames[intent]})`, {
    fieldLabel: context.fieldLabel,
    fieldValueLength: context.fieldValue.length,
    selectedText: context.selectedText,
    trigger: context.trigger
  });

  return intent;
}

export function shouldAutoGenerateField(
  context: FieldAssistContext,
  draft?: FieldAssistDraft | null,
) {
  return resolveFieldAssistIntent(context, draft) === 'autoGenerate'
    && (!draft || draft.contextKey !== getFieldAssistContextKey(context));
}
