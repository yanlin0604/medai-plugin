import { describe, expect, it } from 'vitest';
import {
  applyFieldCompletionText,
  hasUsableEvidence,
  resolveCompletionWritebackMode,
  resolveDefaultSelectedEvidenceIds,
  stripEvidenceCitationMarkers,
} from './evidenceCompletion';
import type { RuntimeEvidenceBundleDto } from './pluginRuntimeTypes';

const bundle = (evidenceIds: Array<string | undefined>): RuntimeEvidenceBundleDto => ({
  patientId: 'ZY001',
  visitId: 'ZY001',
  documentType: '出院记录',
  docCode: 'DOC010',
  fieldKey: 'treatmentCourse',
  evidenceItems: evidenceIds.map((evidenceId, index) => ({
    evidenceId: evidenceId ?? '',
    sourceSystem: 'LIS',
    evidenceType: 'lab',
    title: `证据${index + 1}`,
  })),
  sourceStatuses: [],
  warnings: [],
});

describe('evidenceCompletion helpers', () => {
  it('selects usable evidence IDs by default and ignores blanks or duplicates', () => {
    expect(resolveDefaultSelectedEvidenceIds(bundle(['lis-1', '', 'lis-1', undefined, 'pacs-1'])))
      .toEqual(['lis-1', 'pacs-1']);
    expect(resolveDefaultSelectedEvidenceIds(null)).toEqual([]);
    expect(hasUsableEvidence(bundle(['', undefined]).evidenceItems)).toBe(false);
    expect(hasUsableEvidence(bundle(['lis-1']).evidenceItems)).toBe(true);
  });

  it('resolves writeback mode from backend recommendation with safe fallback', () => {
    expect(resolveCompletionWritebackMode({ recommendedWritebackMode: 'overwrite' }, '原文')).toBe('overwrite');
    expect(resolveCompletionWritebackMode({ recommendedWritebackMode: 'invalid' as never }, '原文')).toBe('append');
    expect(resolveCompletionWritebackMode(null, '')).toBe('fill');
  });

  it('strips numeric citation markers before applying generated text', () => {
    expect(stripEvidenceCitationMarkers('继续抗血小板治疗[1]，复查血常规 [2, 3]。'))
      .toBe('继续抗血小板治疗 ，复查血常规 。');

    expect(applyFieldCompletionText('', '新增诊疗建议[1]', 'fill')).toBe('新增诊疗建议');
    expect(applyFieldCompletionText('原诊疗经过', '补充复查结果[2]', 'append'))
      .toBe('原诊疗经过\n补充复查结果');
    expect(applyFieldCompletionText('原诊疗经过', '覆盖为新文本[3]', 'overwrite')).toBe('覆盖为新文本');
  });
});
