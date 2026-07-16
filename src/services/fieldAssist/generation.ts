import { pluginRuntimeApi } from '../pluginRuntime';
import type { RuntimeFieldCompletionResponse } from '../pluginRuntimeTypes';
import type { FieldAssistContext, FieldAssistDraft } from './types';
import { getFieldAssistContextKey } from './types';

export const FIELD_GENERATION_UNAVAILABLE_MESSAGE =
  '该字段无需助手生成，请手动编辑；也可使用语音原文直接回填。';
export const COMPOSITION_FIXED_GENERATION_MESSAGE =
  '该内容来自组合字段固定模板，无需助手生成。';
export const COMPOSITION_MANUAL_GENERATION_MESSAGE =
  '该内容需要手动填写，无需助手生成。';
export const COMPOSITION_TEMPLATE_UNAVAILABLE_MESSAGE =
  '当前组合字段模板不可用，请刷新文书后重试。';

export function getFieldGenerationUnavailableMessage(
  context: Pick<FieldAssistContext, 'assistantDisabledReason' | 'compositionSourceType'>,
): string {
  const sourceType = String(context.compositionSourceType ?? '').trim().toLowerCase();
  if (sourceType === 'fixed') return COMPOSITION_FIXED_GENERATION_MESSAGE;
  if (sourceType === 'manual') return COMPOSITION_MANUAL_GENERATION_MESSAGE;
  return context.assistantDisabledReason || FIELD_GENERATION_UNAVAILABLE_MESSAGE;
}

export function canGenerateField(
  context: Pick<FieldAssistContext, 'assistantEnabled' | 'compositionSourceType' | 'fieldKey' | 'parentFieldKey' | 'compositionItemKey'>,
): boolean {
  const sourceType = String(context.compositionSourceType ?? '').trim().toLowerCase();
  const hasCompositionIdentity = Boolean(context.parentFieldKey && context.compositionItemKey);
  if (sourceType && (!hasCompositionIdentity || context.fieldKey !== context.parentFieldKey)) return false;
  return context.assistantEnabled && (!sourceType || sourceType === 'ai');
}

async function resolveCompositionTemplateId(context: FieldAssistContext): Promise<number | undefined> {
  if (!context.compositionItemKey) return context.compositionTemplateId;
  if (context.compositionTemplateId !== undefined && context.compositionTemplateId !== null) {
    return context.compositionTemplateId;
  }
  if (!context.parentFieldKey || context.fieldKey !== context.parentFieldKey) {
    throw new Error(COMPOSITION_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
  let composition;
  try {
    composition = await pluginRuntimeApi.getFieldComposition(context.docCode, context.parentFieldKey, {
      doctorCode: context.doctorCode,
      doctorName: context.doctorName,
      deptCode: context.deptCode,
      hospitalCode: context.hospitalCode,
      clientId: context.clientId,
    });
  } catch {
    throw new Error(COMPOSITION_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
  const selectedTemplateId = composition.selectedTemplateId;
  const selectedTemplate = selectedTemplateId == null
    ? undefined
    : composition.templates.find((template) => template.templateId === selectedTemplateId);
  const selectedItem = selectedTemplate?.items.find((item) => item.itemKey === context.compositionItemKey);
  if (
    selectedTemplateId == null
    || !selectedTemplate
    || !selectedItem
    || selectedItem.sourceType !== 'ai'
  ) {
    throw new Error(COMPOSITION_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
  return selectedTemplateId;
}

export async function generateFieldDraft(
  context: FieldAssistContext,
  instruction?: string,
  transcriptText?: string,
): Promise<FieldAssistDraft> {
  if (!canGenerateField(context)) {
    throw new Error(getFieldGenerationUnavailableMessage(context));
  }

  const compositionTemplateId = await resolveCompositionTemplateId(context);
  const response: RuntimeFieldCompletionResponse = await pluginRuntimeApi.completeField({
    patientId: context.patientId,
    visitId: context.patientId,
    documentType: context.docName,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
    fieldName: context.fieldLabel,
    currentText: context.fieldValue,
    selectedText: context.selectedText,
    mode: context.selectedText ? 'rewrite_selection' : context.fieldValue.trim() ? 'append' : 'generate',
    instruction,
    transcriptText,
    parentFieldKey: context.parentFieldKey,
    compositionItemKey: context.compositionItemKey,
    compositionItemLabel: context.compositionItemLabel,
    compositionTemplateId,
    doctorCode: context.doctorCode,
    doctorName: context.doctorName,
    deptCode: context.deptCode,
    hospitalCode: context.hospitalCode,
    clientId: context.clientId,
  });

  return {
    contextKey: getFieldAssistContextKey(context),
    response,
    generatedText: response.generatedText,
    source: 'generation',
    instruction,
    createdAt: new Date().toISOString(),
  };
}

export function buildSuggestionDraft(
  context: FieldAssistContext,
  text: string,
  instruction = '候选回填',
): FieldAssistDraft {
  const response: RuntimeFieldCompletionResponse = {
    generationId: `suggestion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    patientId: context.patientId,
    visitId: context.patientId,
    documentType: context.docName,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
    parentFieldKey: context.parentFieldKey,
    compositionItemKey: context.compositionItemKey,
    compositionItemLabel: context.compositionItemLabel,
    generatedText: text,
    usedEvidenceIds: [],
    evidenceSummary: [],
    warnings: [],
    recommendedWritebackMode: context.selectedText.trim() ? 'overwrite' : context.fieldValue.trim() ? 'append' : 'fill',
    generatedAt: new Date().toISOString(),
  };

  return {
    contextKey: getFieldAssistContextKey(context),
    response,
    generatedText: text,
    source: 'suggestion',
    instruction,
    createdAt: new Date().toISOString(),
  };
}
