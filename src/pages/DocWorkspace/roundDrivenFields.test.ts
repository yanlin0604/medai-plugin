import { describe, expect, it } from 'vitest';
import { selectRoundDrivenSessions } from './roundDrivenFields';

const session = (label: string, roundDriven: boolean, value = '') => ({
  field: { roundDriven },
  value,
  label,
});

describe('查房驱动字段筛选', () => {
  it('只选择标记为 roundDriven 的字段', () => {
    const sessions = [
      session('日常病程内容', true),
      session('辅助检查结果', false),
      session('医嘱执行状态', false),
      session('注意事项', false),
      session('目前情况', true),
    ];

    expect(selectRoundDrivenSessions(sessions, false).map(({ label }) => label)).toEqual([
      '日常病程内容',
      '目前情况',
    ]);
  });

  it('默认跳过已有内容，覆盖模式允许重新生成已有内容', () => {
    const sessions = [session('日常病程内容', true, '已有内容')];

    expect(selectRoundDrivenSessions(sessions, false)).toHaveLength(0);
    expect(selectRoundDrivenSessions(sessions, true)).toHaveLength(1);
  });
});
