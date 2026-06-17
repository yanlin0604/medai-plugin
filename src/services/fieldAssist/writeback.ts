import { invoke } from '@tauri-apps/api/core';
import { normalizeEvidenceWritebackMode, stripEvidenceCitationMarkers } from '../evidenceCompletion';
import { pluginRuntimeApi } from '../pluginRuntime';
import { isTauriRuntime } from '../windowMode';
import type {
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from '../pluginRuntimeTypes';
import type { FieldAssistContext, FieldWritebackPayload } from './types';

export interface ApplyFieldDraftOptions {
  context: FieldAssistContext;
  response: RuntimeFieldCompletionResponse;
  finalText?: string;
  mode?: RuntimeEvidenceWritebackMode;
  doctorName?: string;
}

export function resolveFieldWritebackMode(
  context: Pick<FieldAssistContext, 'fieldValue' | 'selectedText'>,
  preferred?: RuntimeEvidenceWritebackMode,
): RuntimeEvidenceWritebackMode | 'replaceSelection' {
  if (context.selectedText.trim()) return 'replaceSelection';
  if (preferred) return normalizeEvidenceWritebackMode(preferred, context.fieldValue.trim() ? 'append' : 'fill');
  return context.fieldValue.trim() ? 'append' : 'fill';
}

export function buildFieldWritebackPayload({
  context,
  response,
  finalText,
  mode,
}: ApplyFieldDraftOptions): FieldWritebackPayload {
  const writebackMode = resolveFieldWritebackMode(context, mode ?? response.recommendedWritebackMode);
  return {
    kind: 'field',
    patientId: context.patientId,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
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
