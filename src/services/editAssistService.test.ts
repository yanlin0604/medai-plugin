import { describe, expect, it } from 'vitest';
import {
  buildEditAssistSuggestions,
  isEditAssistContextStale,
  isUsableEditAssistContext,
  type BsEditAssistContext,
} from './editAssistService';

const baseContext: BsEditAssistContext = {
  source: 'demo-bs',
  patientId: 'ZY20260001',
  patientName: '陈建国',
  docCode: 'DOC010',
  docName: '出院记录',
  fieldKey: 'dischargeOrders',
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
  it('accepts fresh discharge edit context with a usable prefix', () => {
    expect(isUsableEditAssistContext(baseContext, Date.parse(baseContext.receivedAt))).toBe(true);
  });

  it('rejects stale edit context', () => {
    expect(isEditAssistContextStale(baseContext, Date.parse(baseContext.receivedAt) + 10_001)).toBe(true);
    expect(isUsableEditAssistContext(baseContext, Date.parse(baseContext.receivedAt) + 10_001)).toBe(false);
  });

  it('builds term and phrase suggestions for input prefix', () => {
    const suggestions = buildEditAssistSuggestions(baseContext, 0);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((item) => item.text.includes('规律'))).toBe(true);
  });

  it('prioritizes selected text as rewrite context', () => {
    const suggestions = buildEditAssistSuggestions(
      { ...baseContext, selectedText: '胸痛较前缓解', prefix: '' },
      0,
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((item) => item.type === 'term' || item.type === 'rewrite')).toBe(true);
  });
});
