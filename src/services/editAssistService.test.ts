import { HM_DISCHARGE_ORDERS_FIELD_KEY } from '../config/hmFieldKeys';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchEditAssistSuggestions,
  getEditAssistModeLabel,
  isEditAssistContextStale,
  isUsableEditAssistContext,
  resolveEditAssistType,
  type BsEditAssistContext,
} from './editAssistService';
import { pluginRuntimeApi } from './pluginRuntime';

vi.mock('./pluginRuntime', () => ({
  pluginRuntimeApi: {
    getEditAssistSuggestions: vi.fn(),
  },
}));

const baseContext: BsEditAssistContext = {
  source: 'demo-bs',
  patientId: 'ZY20260001',
  patientName: '陈建国',
  docCode: 'DOC010',
  docName: '出院记录',
  fieldKey: HM_DISCHARGE_ORDERS_FIELD_KEY,
  fieldLabel: '出院医嘱',
  fieldValue: '',
  selectedText: '',
  prefix: '规律',
  selectionStart: 2,
  selectionEnd: 2,
  trigger: 'input',
  detectedAt: '2026-06-11T10:00:00.000Z',
  receivedAt: '2026-06-11T10:00:00.000Z',
};

describe('editAssistService', () => {
  beforeEach(() => {
    vi.mocked(pluginRuntimeApi.getEditAssistSuggestions).mockReset();
  });

  it('accepts fresh discharge edit context with a usable prefix', () => {
    expect(isUsableEditAssistContext(baseContext, Date.parse(baseContext.receivedAt))).toBe(true);
  });

  it('accepts continuation context when the field has text but no prefix', () => {
    const context = {
      ...baseContext,
      fieldValue: '患者住院期间病情平稳',
      prefix: '',
      selectionStart: 10,
      selectionEnd: 10,
      trigger: 'focus',
    };

    expect(isUsableEditAssistContext(context, Date.parse(context.receivedAt))).toBe(true);
    expect(resolveEditAssistType(context)).toBe('continue');
    expect(getEditAssistModeLabel(context)).toBe('输入候选');
  });

  it('uses continuation on focus even when a cursor prefix can be derived from existing text', () => {
    const context = {
      ...baseContext,
      fieldValue: '患者住院期间病情平稳',
      prefix: '平稳',
      selectionStart: 10,
      selectionEnd: 10,
      trigger: 'focus',
    };

    expect(resolveEditAssistType(context)).toBe('continue');
  });

  it('accepts CS端 (demo-cs) edit context', () => {
    const csContext = { ...baseContext, source: 'demo-cs' as const };
    expect(isUsableEditAssistContext(csContext, Date.parse(csContext.receivedAt))).toBe(true);
  });

  it('rejects invalid source edit context', () => {
    const invalidContext = { ...baseContext, source: 'unknown-source' };
    expect(isUsableEditAssistContext(invalidContext, Date.parse(invalidContext.receivedAt))).toBe(false);
  });

  it('rejects stale edit context', () => {
    expect(isEditAssistContextStale(baseContext, Date.parse(baseContext.receivedAt) + 10_001)).toBe(true);
    expect(isUsableEditAssistContext(baseContext, Date.parse(baseContext.receivedAt) + 10_001)).toBe(false);
  });

  it('loads suggestions from backend runtime API', async () => {
    vi.mocked(pluginRuntimeApi.getEditAssistSuggestions).mockResolvedValue({
      suggestions: [
        { id: 'term-1', type: 'term', text: '规律服药', source: 'terms' },
        { id: 'phrase-2', type: 'phrase', text: '建议遵医嘱规律服药。', source: 'ai' },
      ],
      warnings: [],
    });

    const suggestions = await fetchEditAssistSuggestions(baseContext, 1);

    expect(pluginRuntimeApi.getEditAssistSuggestions).toHaveBeenCalledWith({
      patientId: baseContext.patientId,
      docCode: baseContext.docCode,
      docName: baseContext.docName,
      fieldKey: baseContext.fieldKey,
      fieldLabel: baseContext.fieldLabel,
      fieldValue: baseContext.fieldValue,
      selectedText: baseContext.selectedText,
      prefix: baseContext.prefix,
      assistType: 'continue',
      trigger: baseContext.trigger,
      batchIndex: 1,
    });
    expect(suggestions).toEqual([
      { id: 'term-1', type: 'term', text: '规律服药', source: 'terms' },
      { id: 'phrase-2', type: 'phrase', text: '建议遵医嘱规律服药。', source: 'ai' },
    ]);
  });

  it('normalizes unknown backend suggestion values', async () => {
    vi.mocked(pluginRuntimeApi.getEditAssistSuggestions).mockResolvedValue({
      suggestions: [
        { id: 'x', type: 'unknown', text: '候选文本', source: 'model' },
      ],
    });

    await expect(fetchEditAssistSuggestions(baseContext)).resolves.toEqual([
      { id: 'x', type: 'phrase', text: '候选文本', source: 'ai' },
    ]);
  });
});
