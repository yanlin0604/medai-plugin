import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EvidencePanel, { formatEvidenceInsertText, parseSubItems } from './EvidencePanel';
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

  it('parases sub items from original text or structured data', () => {
    // 1. 从原文本拆分（换行和分号）
    const item1 = {
      evidenceId: '1',
      sourceSystem: 'LIS',
      evidenceType: 'lab',
      originalText: '白细胞计数: 12.0 x10^9/L ↑\n红细胞计数: 4.2 x10^12/L; 血红蛋白: 120 g/L',
    };
    const parsed1 = parseSubItems(item1);
    expect(parsed1).toHaveLength(3);
    expect(parsed1[0].text).toBe('白细胞计数: 12.0 x10^9/L ↑');
    expect(parsed1[0].isAbnormal).toBe(true);
    expect(parsed1[1].text).toBe('红细胞计数: 4.2 x10^12/L');
    expect(parsed1[1].isAbnormal).toBe(false);
    expect(parsed1[2].text).toBe('血红蛋白: 120 g/L');

    // 2. 从 structuredData 中拆分
    const item2 = {
      evidenceId: '2',
      sourceSystem: 'LIS',
      evidenceType: 'lab',
      structuredData: {
        items: [
          { name: '中性粒细胞比例', value: '82.0', unit: '%', flag: 'H' },
          { name: '淋巴细胞比例', value: '18.0', unit: '%', flag: 'N' }
        ]
      }
    };
    const parsed2 = parseSubItems(item2);
    expect(parsed2).toHaveLength(2);
    expect(parsed2[0].text).toBe('中性粒细胞比例: 82.0 % H');
    expect(parsed2[0].isAbnormal).toBe(true);
    expect(parsed2[1].text).toBe('淋巴细胞比例: 18.0 %');
    expect(parsed2[1].isAbnormal).toBe(false);
  });
});
