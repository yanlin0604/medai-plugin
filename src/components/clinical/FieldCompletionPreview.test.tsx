import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FieldCompletionPreview from './FieldCompletionPreview';
import type { RuntimeFieldCompletionResponse } from '../../services/pluginRuntimeTypes';

const response: RuntimeFieldCompletionResponse = {
  generationId: 'FCR-1',
  patientId: 'ZY001',
  visitId: 'ZY001',
  documentType: '出院记录',
  docCode: 'DOC010',
  fieldKey: 'treatmentCourse',
  generatedText: '住院期间完善血常规、心电图等检查[1]，予以抗血小板治疗[2]。',
  usedEvidenceIds: ['lis-1', 'emr-1'],
  evidenceSummary: [
    {
      evidenceId: 'lis-1',
      sourceSystem: 'LIS',
      evidenceType: 'lab',
      title: '血常规',
      summary: '白细胞计数正常。',
      abnormalFlag: 'normal',
      occurredAt: '2026-06-06T09:30:00',
    },
  ],
  warnings: ['部分来源暂不可用'],
  recommendedWritebackMode: 'append',
  responseTimeMs: 120,
};

describe('FieldCompletionPreview', () => {
  it('renders citation-free draft, warnings, evidence summary and apply actions', () => {
    const html = renderToStaticMarkup(
      <FieldCompletionPreview
        response={response}
        currentText="原诊疗经过"
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('补全预览');
    expect(html).toContain('部分来源暂不可用');
    expect(html).toContain('住院期间完善血常规、心电图等检查');
    expect(html).toContain('予以抗血小板治疗');
    expect(html).not.toContain('[1]');
    expect(html).not.toContain('[2]');
    expect(html).toContain('血常规');
    expect(html).toContain('填入');
    expect(html).toContain('追加');
    expect(html).toContain('覆盖');
    expect(html).toContain('关闭补全预览');
  });

  it('renders backend failure state without apply actions', () => {
    const html = renderToStaticMarkup(
      <FieldCompletionPreview
        error="字段证据补全失败"
        onApply={() => undefined}
      />,
    );

    expect(html).toContain('字段证据补全失败');
    expect(html).not.toContain('填入');
    expect(html).not.toContain('追加');
    expect(html).not.toContain('覆盖');
  });
});
