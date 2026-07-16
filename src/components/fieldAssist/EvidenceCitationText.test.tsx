import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEvidenceSummaryDto } from '../../services/pluginRuntimeTypes';

vi.mock('antd', () => ({
  Popover: ({ children, content }: { children: ReactNode; content: ReactNode }) => (
    <span data-testid="evidence-popover">
      {children}
      <span data-testid="evidence-content">{content}</span>
    </span>
  ),
  Tag: ({ children, title }: { children: ReactNode; title?: string }) => (
    <button type="button" title={title}>{children}</button>
  ),
}));

import { EvidenceCitationText } from './EvidenceCitationText';

const evidenceSummary: RuntimeEvidenceSummaryDto[] = [{
  evidenceId: 'his-001',
  sourceSystem: 'cs-demo',
  evidenceType: 'document',
  occurredAt: '2026-07-16T08:30:00+08:00',
  title: '出院带药医嘱',
  summary: '继续口服阿司匹林。',
  originalText: 'HIS 医嘱原文：阿司匹林肠溶片 100mg qd。',
}];

function render(text: string, summary: RuntimeEvidenceSummaryDto[] = evidenceSummary): string {
  return renderToStaticMarkup(<EvidenceCitationText text={text} evidenceSummary={summary} />);
}

describe('EvidenceCitationText', () => {
  it('将数字引用和完整 evidenceId 渲染为可点击入口，但不模糊绑定 substring', () => {
    const markup = render('依据[1]与[his-001]，但[his-00]未匹配。');

    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('title="点击查看出处"');
    expect(markup).toContain('his-00');
  });

  it('证据详情展示来源、标题、摘要、时间和原始上下文', () => {
    const markup = render('用药建议[1]');

    expect(markup).toContain('病历系统');
    expect(markup).toContain('出院带药医嘱');
    expect(markup).toContain('继续口服阿司匹林。');
    expect(markup).toContain('证据时间：');
    expect(markup).toContain('展开完整上下文');
    expect(markup).toContain('HIS 医嘱原文：阿司匹林肠溶片 100mg qd。');
  });

  it('保留多引用括号、分隔符和未匹配引用', () => {
    const markup = render('参考[1, missing-id]。');

    expect(markup).toContain('<span>[</span>');
    expect(markup).toContain('<span>, </span>missing-id');
    expect(markup).toContain('<span>]</span>');
    expect(markup.match(/<button/g)).toHaveLength(1);
  });

  it('无证据时保持原始引用且不创建点击入口', () => {
    const markup = render('建议复诊[1]。', []);

    expect(markup).toContain('[1]');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('data-testid="evidence-popover"');
  });
});
