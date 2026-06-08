import { describe, expect, it } from 'vitest';
import type { MeetingVoiceSegment } from '../../services/types';
import { buildMeetingConfigs } from './meetingData';
import { buildMeetingSections, getMeetingSubmitIssues } from './meetingDraft';

const configs = buildMeetingConfigs(null);

describe('meetingDraft', () => {
  it('builds DOC005 sections from confirmed meeting segments', () => {
    const config = configs.DOC005;
    const sections = buildMeetingSections(config, config.initialSegments);
    const discussion = sections.find((section) => section.key === 'discussionOpinions');
    const conclusion = sections.find((section) => section.key === 'finalConclusion');

    expect(discussion?.text).toContain('赵敏');
    expect(discussion?.text).toContain('诊断分歧');
    expect(conclusion?.text).toContain('不稳定型心绞痛');
  });

  it('keeps DOC012 death discussion conclusion manual by default', () => {
    const config = configs.DOC012;
    const sections = buildMeetingSections(config, config.initialSegments);
    const conclusion = sections.find((section) => section.key === 'manualConclusion');

    expect(conclusion?.text).toBe('');
    expect(conclusion?.source).toBe('manual');
  });

  it('requires manual confirmation for DOC012 before submit', () => {
    const config = configs.DOC012;

    expect(getMeetingSubmitIssues(config, config.initialSegments, false)).toContain(
      '死亡讨论结论需要主持医师人工确认后才能提交。',
    );
    expect(getMeetingSubmitIssues(config, config.initialSegments, true)).toEqual([]);
  });

  it('blocks unconfirmed meeting transcript segments', () => {
    const config = configs.DOC005;
    const segments: MeetingVoiceSegment[] = [
      ...config.initialSegments,
      {
        id: 'draft',
        speakerName: '林志远',
        speakerRole: '主持医师',
        topicKey: 'risk',
        originalText: '仍需确认',
        revisedText: '仍需确认',
        status: 'draft',
      },
    ];

    expect(getMeetingSubmitIssues(config, segments, true)).toContain('仍有 1 条会议发言未确认，提交前需处理。');
  });
});
