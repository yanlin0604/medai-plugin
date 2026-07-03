import { describe, expect, it } from 'vitest';
import { formatEmrContextDebugLabel } from './debugLabel';
import type { EmrContextDebug } from './types';

describe('formatEmrContextDebugLabel', () => {
  it('hides document code for accepted EMR context', () => {
    const debug: EmrContextDebug = {
      status: 'accepted',
      message: '已接收 上级医师查房记录',
      context: {
        source: 'demo-cs',
        patientId: 'P001',
        patientName: '张三',
        docCode: 'DOC003',
        docName: '上级医师查房记录',
        confidence: 0.98,
        signals: ['document-title'],
        detectedAt: '2026-06-08T08:30:00.000Z',
        receivedAt: '2026-06-08T08:30:00.000Z',
      },
      checkedAt: '2026-06-08T08:30:00.000Z',
    };

    const label = formatEmrContextDebugLabel(debug);

    expect(label).toBe('已接收：上级医师查房记录');
    expect(label).not.toContain('DOC003');
  });
});
