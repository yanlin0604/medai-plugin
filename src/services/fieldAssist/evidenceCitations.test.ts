import { describe, expect, it } from 'vitest';
import {
  buildCompositeEvidencePreview,
  resolveEvidenceCitation,
  splitCitationReferences,
  stripEvidenceCitationMarkers,
  tokenizeCitationText,
} from './evidenceCitations';
import type { RuntimeEvidenceSummaryDto } from '../pluginRuntimeTypes';

const evidence = (evidenceId: string, title = evidenceId): RuntimeEvidenceSummaryDto => ({
  evidenceId,
  sourceSystem: 'HIS',
  evidenceType: 'document',
  title,
  summary: `${title}摘要`,
});

describe('证据引用解析', () => {
  it('支持数字、完整 evidenceId、中英文逗号和空格，但不做 substring 模糊匹配', () => {
    const summary = [evidence('his-001'), evidence('his-001-extra')];
    expect(splitCitationReferences('[1, 2，his-001 pacs-002]')).toEqual(['1', '2', 'his-001', 'pacs-002']);
    expect(resolveEvidenceCitation('1', summary)?.evidenceId).toBe('his-001');
    expect(resolveEvidenceCitation('his-001-extra', summary)?.displayNumber).toBe(2);
    expect(resolveEvidenceCitation('his-00', summary)).toBeNull();
    expect(tokenizeCitationText('检查结果[1]，请结合[his-001]。')).toEqual([
      { type: 'text', value: '检查结果' },
      { type: 'citation', value: '[1]' },
      { type: 'text', value: '，请结合' },
      { type: 'citation', value: '[his-001]' },
      { type: 'text', value: '。' },
    ]);
  });

  it('支持外部文书基于原生 HmEditor 字段键生成的完整 evidenceId', () => {
    const evidenceId = 'ext-doc-42-hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac';
    const summary = [evidence(evidenceId)];

    expect(splitCitationReferences(`[${evidenceId}]`)).toEqual([evidenceId]);
    expect(resolveEvidenceCitation(evidenceId, summary)?.evidenceId).toBe(evidenceId);
    expect(tokenizeCitationText(`出院医嘱[${evidenceId}]`)).toEqual([
      { type: 'text', value: '出院医嘱' },
      { type: 'citation', value: `[${evidenceId}]` },
    ]);
  });

  it('组合各子项按本地引用解析后全局重编号并复用相同证据', () => {
    const preview = buildCompositeEvidencePreview([
      { itemKey: 'medicationAdvice', itemLabel: '用药指导', text: '按医嘱服药[1]', evidenceSummary: [evidence('his-001')] },
      { itemKey: 'followupAdvice', itemLabel: '随访复诊', text: '两周复诊[pacs-002, 1]', evidenceSummary: [evidence('pacs-002'), evidence('his-001')] },
    ]);
    expect(preview.evidenceSummary.map((item) => item.evidenceId)).toEqual(['his-001', 'pacs-002']);
    expect(preview.sections.map((section) => section.text)).toEqual([
      '按医嘱服药[1]',
      '两周复诊[2, 2]',
    ]);
  });

  it('按 itemOrder 合并，无 ID 证据保持子项局部身份，未匹配引用保持原文', () => {
    const preview = buildCompositeEvidencePreview([
      {
        itemKey: 'followupAdvice',
        itemLabel: '随访复诊',
        itemOrder: 4,
        text: '复诊[1, missing-id]',
        evidenceSummary: [evidence('')],
      },
      {
        itemKey: 'medicationAdvice',
        itemLabel: '用药指导',
        itemOrder: 3,
        text: '服药[1]',
        evidenceSummary: [evidence('')],
      },
    ]);
    expect(preview.sections.map((section) => section.itemKey)).toEqual(['medicationAdvice', 'followupAdvice']);
    expect(preview.sections.map((section) => section.text)).toEqual(['服药[1]', '复诊[2, missing-id]']);
    expect(preview.evidenceSummary).toHaveLength(2);
  });

  it('正式写回统一移除证据标记但保留正文', () => {
    expect(stripEvidenceCitationMarkers('继续服药[1]，两周复诊【his-001， 2】。'))
      .toBe('继续服药 ，两周复诊 。');
  });
});
