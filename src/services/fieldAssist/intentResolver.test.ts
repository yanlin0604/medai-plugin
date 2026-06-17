import { describe, expect, it } from 'vitest';
import type { RuntimeFieldCompletionResponse } from '../pluginRuntimeTypes';
import { getFieldAssistContextKey, type FieldAssistContext, type FieldAssistDraft } from './types';
import { resolveFieldAssistIntent, shouldAutoGenerateField } from './intentResolver';

function createContext(overrides: Partial<FieldAssistContext> = {}): FieldAssistContext {
  return {
    source: 'demo-cs',
    patientId: 'P001',
    patientName: '张三',
    docCode: 'DOC001',
    docName: '入院记录',
    fieldKey: 'presentIllness',
    fieldLabel: '现病史',
    fieldValue: '',
    selectedText: '',
    prefix: '',
    selectionStart: 0,
    selectionEnd: 0,
    trigger: 'focus',
    sessionId: 'session-1',
    writebackUrl: 'http://127.0.0.1:3000/api/writeback',
    detectedAt: '2026-06-17T00:00:00.000Z',
    receivedAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  };
}

function createDraft(context: FieldAssistContext): FieldAssistDraft {
  const response: RuntimeFieldCompletionResponse = {
    generationId: 'gen-1',
    patientId: context.patientId,
    visitId: context.patientId,
    documentType: context.docName,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
    generatedText: '患者诉胸闷不适。',
    usedEvidenceIds: [],
    evidenceSummary: [],
    warnings: [],
  };

  return {
    contextKey: getFieldAssistContextKey(context),
    response,
    generatedText: response.generatedText,
    createdAt: '2026-06-17T00:00:01.000Z',
  };
}

describe('fieldAssist intentResolver', () => {
  it('prioritizes selected text rewriting over prefix suggestions', () => {
    const context = createContext({
      selectedText: '胸闷',
      prefix: '胸闷',
      trigger: 'selection',
      selectionStart: 2,
      selectionEnd: 4,
    });

    expect(resolveFieldAssistIntent(context)).toBe('rewrite');
  });

  it('uses term suggestions only for input prefix with content', () => {
    const context = createContext({
      fieldValue: '患者胸闷',
      prefix: '胸闷',
      trigger: 'input',
      selectionStart: 4,
      selectionEnd: 4,
    });

    expect(resolveFieldAssistIntent(context)).toBe('term');
  });

  it('auto-generates an empty focused field and suppresses duplicate generation for the same draft', () => {
    const context = createContext();
    const draft = createDraft(context);

    expect(resolveFieldAssistIntent(context)).toBe('autoGenerate');
    expect(shouldAutoGenerateField(context)).toBe(true);
    expect(shouldAutoGenerateField(context, draft)).toBe(false);
  });

  it('does not reuse a draft from another field session', () => {
    const oldContext = createContext({ sessionId: 'session-old' });
    const nextContext = createContext({ sessionId: 'session-next' });

    expect(shouldAutoGenerateField(nextContext, createDraft(oldContext))).toBe(true);
  });

  it('shows an existing draft only when the current non-empty field matches it', () => {
    const context = createContext({
      fieldValue: '已有内容',
      trigger: 'focus',
    });

    expect(resolveFieldAssistIntent(context, createDraft(context))).toBe('draftReady');
  });
});
