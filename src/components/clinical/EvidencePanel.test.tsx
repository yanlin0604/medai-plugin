import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EvidencePanel, { formatEvidenceInsertText } from './EvidencePanel';
import type { RuntimeEvidenceBundleDto, RuntimeEvidenceItemDto } from '../../services/pluginRuntimeTypes';

const labItem: RuntimeEvidenceItemDto = {
  evidenceId: 'lis-1',
  patientId: 'ZY001',
  visitId: 'ZY001',
  sourceSystem: 'LIS',
  evidenceType: 'lab',
  occurredAt: '2026-06-06T09:30:00',
  title: '血常规',
  summary: '白细胞计数正常。',
  originalText: 'WBC 6.1 x10^9/L。',
  abnormalFlag: 'normal',
};

const bundle: RuntimeEvidenceBundleDto = {
  patientId: 'ZY001',
  visitId: 'ZY001',
  documentType: '出院记录',
  docCode: 'DOC010',
  fieldKey: 'treatmentCourse',
  evidenceItems: [labItem],
  sourceStatuses: [
    {
      sourceSystem: 'LIS',
      status: 'success',
      evidenceCount: 1,
      message: '已读取检验资料',
    },
  ],
  warnings: [],
};

describe('EvidencePanel', () => {
  it('formats a material item as plain text for drag and insert', () => {
    expect(formatEvidenceInsertText(labItem)).toBe('[LIS 检验] 2026-06-06 09:30\n血常规\n白细胞计数正常。');
  });

  it('renders materials without the AI completion preview action', () => {
    const html = renderToStaticMarkup(
      <EvidencePanel
        bundle={bundle}
        title="诊疗经过资料"
        onInsertEvidence={() => undefined}
      />,
    );

    expect(html).toContain('诊疗经过资料');
    expect(html).toContain('1 条资料');
    expect(html).toContain('血常规');
    expect(html).toContain('加');
    expect(html).toContain('拖动到正文任意位置');
    expect(html).not.toContain('生成预览');
    expect(html).not.toContain('已选');
  });

  it('renders the bottom tray variant with source filters', () => {
    const html = renderToStaticMarkup(
      <EvidencePanel
        bundle={bundle}
        title="临床资料"
        variant="tray"
        onInsertEvidence={() => undefined}
      />,
    );

    expect(html).toContain('临床资料');
    expect(html).toContain('全部');
    expect(html).toContain('LIS');
    expect(html).toContain('血常规');
    expect(html).not.toContain('整份文书');
  });
});
