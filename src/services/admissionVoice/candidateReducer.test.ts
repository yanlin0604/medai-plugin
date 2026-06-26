import { describe, expect, it } from 'vitest';
import {
  candidateReducer,
  createInitialCandidateState,
  selectSafeDocumentCandidates,
} from './candidateReducer';
import type { FieldExtractionCandidateUpdate } from './types';

function update(documentFields: FieldExtractionCandidateUpdate['documentFields']): FieldExtractionCandidateUpdate {
  return {
    sessionId: 's1',
    documentFields,
    patientFields: {},
    fields: {},
    confidence: 0.95,
  };
}

describe('candidateReducer', () => {
  it('合并入院问询候选但不自动采纳', () => {
    const state = candidateReducer(createInitialCandidateState(), {
      type: 'merge',
      update: update({
        chiefComplaint: { value: '反复胸痛3天', updatedAt: 1 },
      }),
      protectedDocumentFieldKeys: [],
    });

    expect(state.documentFields.chiefComplaint.value).toBe('反复胸痛3天');
    expect(state.documentFields.chiefComplaint.status).toBe('pending');
  });

  it('已采纳字段收到不同候选时标记冲突', () => {
    const pending = candidateReducer(createInitialCandidateState(), {
      type: 'merge',
      update: update({
        chiefComplaint: { value: '胸痛3天', updatedAt: 1 },
      }),
      protectedDocumentFieldKeys: [],
    });
    const accepted = candidateReducer(pending, { type: 'accept_document', fieldKey: 'chiefComplaint' });
    const conflicted = candidateReducer(accepted, {
      type: 'merge',
      update: update({
        chiefComplaint: { value: '胸痛伴大汗1天', updatedAt: 2 },
      }),
      protectedDocumentFieldKeys: [],
    });

    expect(conflicted.documentFields.chiefComplaint.status).toBe('conflict');
  });

  it('一键采纳只返回未保护的 pending 候选', () => {
    const state = candidateReducer(createInitialCandidateState(), {
      type: 'merge',
      update: update({
        chiefComplaint: { value: '胸痛3天', updatedAt: 1 },
        presentIllness: { value: '3天前出现胸骨后疼痛。', updatedAt: 1 },
      }),
      protectedDocumentFieldKeys: ['presentIllness'],
    });

    expect(selectSafeDocumentCandidates(state, ['presentIllness']).map((item) => item.key)).toEqual(['chiefComplaint']);
    expect(state.documentFields.presentIllness.status).toBe('conflict');
  });
});
