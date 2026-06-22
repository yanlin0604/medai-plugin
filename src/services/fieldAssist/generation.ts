import { pluginRuntimeApi } from '../pluginRuntime';
import type { RuntimeFieldCompletionResponse } from '../pluginRuntimeTypes';
import type { FieldAssistContext, FieldAssistDraft } from './types';
import { getFieldAssistContextKey } from './types';

export async function generateFieldDraft(
  context: FieldAssistContext,
  instruction?: string,
  transcriptText?: string,
): Promise<FieldAssistDraft> {
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
