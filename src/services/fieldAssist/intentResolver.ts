import type { FieldAssistContext, FieldAssistDraft, FieldAssistIntent } from './types';
import { getFieldAssistContextKey } from './types';

export function resolveFieldAssistIntent(
  context: FieldAssistContext,
  draft?: FieldAssistDraft | null,
): FieldAssistIntent {
  let intent: FieldAssistIntent;
  
  if (context.selectedText.trim()) {
    intent = 'rewrite';
  } else if (!context.fieldValue.trim()) {
    // 如果字段完全为空，无论是刚聚焦还是生成完草稿没回填，都保持在 AI 生成模式（展示草稿卡片）
    intent = 'autoGenerate';
  } else if (context.trigger !== 'input'
    && draft?.contextKey === getFieldAssistContextKey(context)
    && context.fieldValue.trim()) {
    intent = 'draftReady';
  } else {
    // 非划词编辑统一走输入候选：后台合并术语表和 AI 续写。
    intent = 'continue';
  }

  const intentNames: Record<FieldAssistIntent, string> = {
    rewrite: '划词改写',
    autoGenerate: '自动生成',
    continue: '输入候选',
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
