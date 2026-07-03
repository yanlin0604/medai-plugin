import { describe, expect, it } from 'vitest';
import type { DocDefinition } from '../../config/docRegistry';
import { getDocByCode } from '../../config/docRegistry';
import { resolveWindowTitleBarCopy } from './titleBar';

describe('resolveWindowTitleBarCopy', () => {
  it('uses registry document title for direct document routes', () => {
    expect(resolveWindowTitleBarCopy('/doc/DOC003', null).title).toBe('日常病程记录');
  });

  it('uses selected runtime document title when route code matches', () => {
    const baseDoc = getDocByCode('DOC003')!;
    const runtimeDoc: DocDefinition = {
      ...baseDoc,
      code: 'DOC888',
      id: 'doc-888',
      name: '上级查房病历助手',
    };

    expect(resolveWindowTitleBarCopy('/doc/DOC888', runtimeDoc).title).toBe('上级查房病历助手');
  });

  it('uses selected document title over registry title for the same document code', () => {
    const baseDoc = getDocByCode('DOC003')!;
    const runtimeDoc: DocDefinition = {
      ...baseDoc,
      name: '上级医师查房记录',
    };

    expect(resolveWindowTitleBarCopy('/doc/DOC003', runtimeDoc).title).toBe('上级医师查房记录');
  });

  it('does not leak a stale selected document into another document route', () => {
    const staleDoc = getDocByCode('DOC003')!;

    expect(resolveWindowTitleBarCopy('/doc/DOC010', staleDoc).title).toBe('出院记录');
  });

  it('uses route title for the round workbench', () => {
    expect(resolveWindowTitleBarCopy('/round', null)).toMatchObject({
      title: '病区查房录音',
    });
  });
});
