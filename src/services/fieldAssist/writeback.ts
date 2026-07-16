import { invoke } from '@tauri-apps/api/core';
import { normalizeEvidenceWritebackMode } from '../evidenceCompletion';
import { stripEvidenceCitationMarkers } from './evidenceCitations';
import { pluginRuntimeApi } from '../pluginRuntime';
import { isTauriRuntime } from '../windowMode';
import type {
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from '../pluginRuntimeTypes';
import type { FieldAssistContext, FieldWritebackPayload } from './types';

export interface FieldTextInsertion {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

function clampOffset(value: number, max: number) {
  if (!Number.isFinite(value)) return max;
  return Math.max(0, Math.min(max, Math.trunc(value)));
}

export function insertTextIntoFieldContext(
  context: Pick<FieldAssistContext, 'fieldValue' | 'selectionStart' | 'selectionEnd'>,
  insertText: string,
): FieldTextInsertion {
  const currentText = context.fieldValue ?? '';
  const anchor = clampOffset(context.selectionStart, currentText.length);
  const focus = clampOffset(context.selectionEnd, currentText.length);
  const selectionStart = Math.min(anchor, focus);
  const selectionEnd = Math.max(anchor, focus);
  const text = `${currentText.slice(0, selectionStart)}${insertText}${currentText.slice(selectionEnd)}`;

  return {
    text,
    selectionStart,
    selectionEnd: selectionStart + insertText.length,
  };
}

export interface ApplyFieldDraftOptions {
  context: FieldAssistContext;
  response: RuntimeFieldCompletionResponse;
  finalText?: string;
  mode?: RuntimeEvidenceWritebackMode | 'replaceSelection';
  doctorName?: string;
}

export function resolveFieldWritebackMode(
  context: Pick<FieldAssistContext, 'fieldValue' | 'selectedText'>,
  preferred?: RuntimeEvidenceWritebackMode | 'replaceSelection',
): RuntimeEvidenceWritebackMode | 'replaceSelection' {
  if (preferred === 'replaceSelection') return 'replaceSelection';
  if (context.selectedText.trim()) return 'replaceSelection';
  if (preferred) return normalizeEvidenceWritebackMode(preferred, context.fieldValue.trim() ? 'append' : 'fill');
  return context.fieldValue.trim() ? 'append' : 'fill';
}

export function assertFieldResponseIdentity(
  context: Pick<FieldAssistContext, 'patientId' | 'docCode' | 'fieldKey' | 'parentFieldKey' | 'compositionItemKey'>,
  response: Pick<RuntimeFieldCompletionResponse, 'patientId' | 'docCode' | 'fieldKey' | 'parentFieldKey' | 'compositionItemKey'>,
): void {
  const expectedParentFieldKey = context.parentFieldKey
    ?? (response.parentFieldKey ? context.fieldKey : '');
  const matches = context.patientId === response.patientId
    && context.docCode === response.docCode
    && context.fieldKey === response.fieldKey
    && expectedParentFieldKey === (response.parentFieldKey ?? '')
    && (context.compositionItemKey ?? '') === (response.compositionItemKey ?? '');
  if (!matches) {
    throw new Error('生成结果与当前患者、文书或组合字段不匹配，已阻止回填');
  }
}

export function buildFieldWritebackPayload({
  context,
  response,
  finalText,
  mode,
}: ApplyFieldDraftOptions): FieldWritebackPayload {
  assertFieldResponseIdentity(context, response);
  const writebackMode = resolveFieldWritebackMode(context, mode ?? response.recommendedWritebackMode);
  return {
    kind: 'field',
    patientId: context.patientId,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
    ...(context.dataElementCode ? { dataElementCode: context.dataElementCode } : {}),
    ...(context.dataElementName ? { dataElementName: context.dataElementName } : {}),
    ...(context.parentFieldKey ? { parentFieldKey: context.parentFieldKey } : {}),
    ...(context.compositionItemKey ? { compositionItemKey: context.compositionItemKey } : {}),
    ...(context.compositionItemLabel ? { compositionItemLabel: context.compositionItemLabel } : {}),
    sessionId: context.sessionId,
    text: stripEvidenceCitationMarkers(finalText ?? response.generatedText),
    writebackMode,
    selectionStart: context.selectionStart,
    selectionEnd: context.selectionEnd,
    generationId: response.generationId,
  };
}

export async function applyFieldDraft(options: ApplyFieldDraftOptions) {
  const payload = buildFieldWritebackPayload(options);
  if (!payload.text.trim()) {
    throw new Error('字段生成结果为空，无法回填');
  }

  if (isTauriRuntime()) {
    await invoke('push_field_writeback_http', {
      url: options.context.writebackUrl,
      payload,
    });
  } else {
    localStorage.setItem('medaiPlugin.lastFieldWriteback', JSON.stringify({
      payload,
      writtenAt: new Date().toISOString(),
    }));
  }

  const auditMode: RuntimeEvidenceWritebackMode =
    payload.writebackMode === 'replaceSelection' ? 'overwrite' : payload.writebackMode;

  await pluginRuntimeApi.auditFieldWriteback(options.response.generationId, {
    patientId: options.context.patientId,
    visitId: options.context.patientId,
    documentType: options.context.docName,
    docCode: options.context.docCode,
    fieldKey: options.context.fieldKey,
    writebackMode: auditMode,
    finalText: payload.text,
    doctorName: options.doctorName,
  }).catch(() => undefined);

  return payload;
}
