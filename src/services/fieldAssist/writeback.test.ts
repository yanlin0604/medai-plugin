import { describe, expect, it } from 'vitest';
import type { RuntimeFieldCompletionResponse } from '../pluginRuntimeTypes';
import type { FieldAssistContext } from './types';
import { buildFieldWritebackPayload, resolveFieldWritebackMode } from './writeback';

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

function createResponse(overrides: Partial<RuntimeFieldCompletionResponse> = {}): RuntimeFieldCompletionResponse {
  return {
    generationId: 'gen-1',
    patientId: 'P001',
    visitId: 'P001',
    documentType: '入院记录',
    docCode: 'DOC001',
    fieldKey: 'presentIllness',
    generatedText: '患者诉胸闷不适。',
    usedEvidenceIds: [],
    evidenceSummary: [],
    warnings: [],
    ...overrides,
  };
}

describe('fieldAssist writeback', () => {
  it('resolves fill, append and replaceSelection modes from field state', () => {
    expect(resolveFieldWritebackMode({ fieldValue: '', selectedText: '' })).toBe('fill');
    expect(resolveFieldWritebackMode({ fieldValue: '已有内容', selectedText: '' })).toBe('append');
    expect(resolveFieldWritebackMode({ fieldValue: '已有内容', selectedText: '已有' })).toBe('replaceSelection');
    expect(resolveFieldWritebackMode({ fieldValue: '已有内容', selectedText: '' }, 'overwrite')).toBe('overwrite');
  });

  it('builds a field payload scoped to the current CS field session', () => {
    const context = createContext({
      fieldValue: '患者',
      selectedText: '患者',
      selectionStart: 0,
      selectionEnd: 2,
    });
    const response = createResponse({
      generatedText: '患者诉胸闷不适。[1, 2]',
      recommendedWritebackMode: 'append',
    });

    expect(buildFieldWritebackPayload({ context, response })).toEqual({
      kind: 'field',
      patientId: 'P001',
      docCode: 'DOC001',
      fieldKey: 'presentIllness',
      sessionId: 'session-1',
      text: '患者诉胸闷不适。',
      writebackMode: 'replaceSelection',
      selectionStart: 0,
      selectionEnd: 2,
      generationId: 'gen-1',
    });
  });
});
