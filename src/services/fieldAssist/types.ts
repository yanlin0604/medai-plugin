import type {
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from '../pluginRuntimeTypes';

export type FieldAssistTrigger = 'focus' | 'input' | 'selection' | (string & {});

export type FieldAssistIntent =
  | 'idle'
  | 'continue'
  | 'rewrite'
  | 'autoGenerate'
  | 'draftReady';

export interface FieldAssistContext {
  source: 'demo-cs' | (string & {});
  patientId: string;
  patientName: string;
  docCode: string;
  docName: string;
  fieldKey: string;
  fieldLabel: string;
  parentFieldKey?: string;
  compositionItemKey?: string;
  compositionItemLabel?: string;
  doctorCode?: string;
  doctorName?: string;
  deptCode?: string;
  hospitalCode?: string;
  clientId?: string;
  fieldValue: string;
  selectedText: string;
  prefix: string;
  selectionStart: number;
  selectionEnd: number;
  trigger: FieldAssistTrigger;
  sessionId: string;
  writebackUrl: string;
  truncated?: boolean;
  detectedAt: string;
  receivedAt: string;
}

export interface FieldAssistDraft {
  contextKey: string;
  response: RuntimeFieldCompletionResponse;
  generatedText: string;
  source?: 'generation' | 'suggestion';
  instruction?: string;
  createdAt: string;
}

export interface FieldWritebackPayload {
  kind: 'field';
  patientId: string;
  docCode: string;
  fieldKey: string;
  parentFieldKey?: string;
  compositionItemKey?: string;
  compositionItemLabel?: string;
  sessionId: string;
  text: string;
  writebackMode: RuntimeEvidenceWritebackMode | 'replaceSelection';
  selectionStart: number;
  selectionEnd: number;
  generationId?: string;
}

export function getFieldAssistContextKey(
  context: Pick<FieldAssistContext, 'patientId' | 'docCode' | 'fieldKey' | 'sessionId' | 'compositionItemKey'>,
) {
  if (context.compositionItemKey) {
    return `${context.patientId}:${context.docCode}:${context.fieldKey}:${context.compositionItemKey}:${context.sessionId}`;
  }
  return `${context.patientId}:${context.docCode}:${context.fieldKey}:${context.sessionId}`;
}

export function getFieldAssistSnapshotKey(context: FieldAssistContext) {
  return [
    getFieldAssistContextKey(context),
    context.parentFieldKey ?? '',
    context.compositionItemKey ?? '',
    context.compositionItemLabel ?? '',
    context.fieldValue,
    context.selectedText,
    context.prefix,
    context.selectionStart,
    context.selectionEnd,
    context.trigger,
    context.writebackUrl,
  ].join('|');
}

export function getFieldIdentityKey(
  context: Pick<FieldAssistContext, 'patientId' | 'docCode' | 'fieldKey' | 'compositionItemKey'>,
) {
  if (context.compositionItemKey) {
    return `${context.patientId}:${context.docCode}:${context.fieldKey}:${context.compositionItemKey}`;
  }
  return `${context.patientId}:${context.docCode}:${context.fieldKey}`;
}
