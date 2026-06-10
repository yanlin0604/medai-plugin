import { describe, expect, it } from 'vitest';
import {
  formatRewriteStatusSyncWarning,
  formatSectionRewriteError,
  normalizeSectionRewriteResult,
} from './SectionEditor';

describe('SectionEditor rewrite helpers', () => {
  it('normalizes string and backend rewrite results', () => {
    expect(normalizeSectionRewriteResult('修改后文本', '原文')).toEqual({
      before: '原文',
      after: '修改后文本',
    });

    expect(normalizeSectionRewriteResult({
      requestId: 7,
      before: '后台原文',
      after: '后台改写',
    }, '原文')).toEqual({
      requestId: 7,
      before: '后台原文',
      after: '后台改写',
    });
  });

  it('formats rewrite failure without implying local fallback', () => {
    expect(formatSectionRewriteError(new Error('模型服务未配置'))).toBe('模型服务未配置');
    expect(formatSectionRewriteError('failed')).toBe('AI 优化失败，请稍后重试。');
  });

  it('formats audit status sync warnings without reverting accepted edits', () => {
    expect(formatRewriteStatusSyncWarning('adopted', new Error('状态同步失败')))
      .toBe('优化已采纳，但状态同步失败');
    expect(formatRewriteStatusSyncWarning('rejected', 'failed'))
      .toBe('优化已拒绝，但审计状态同步失败');
  });
});
