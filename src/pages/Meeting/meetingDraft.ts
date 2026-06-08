import type { ClinicalSection, MeetingVoiceSegment } from '../../services/types';
import type { MeetingDocCode, MeetingWorkbenchConfig } from './meetingData';

export function getConfirmedMeetingSegments(segments: MeetingVoiceSegment[]): MeetingVoiceSegment[] {
  return segments.filter((segment) => segment.status === 'confirmed' && segment.revisedText.trim());
}

export function getMeetingSubmitIssues(
  config: MeetingWorkbenchConfig,
  segments: MeetingVoiceSegment[],
  conclusionConfirmed: boolean,
): string[] {
  const issues: string[] = [];
  const confirmed = getConfirmedMeetingSegments(segments);
  const draftCount = segments.filter((segment) => segment.status !== 'confirmed').length;

  if (!confirmed.length) {
    issues.push('请先确认至少 1 条会议发言片段。');
  }
  if (draftCount > 0) {
    issues.push(`仍有 ${draftCount} 条会议发言未确认，提交前需处理。`);
  }
  if (config.conclusionRequiresManualConfirm && !conclusionConfirmed) {
    issues.push('死亡讨论结论需要主持医师人工确认后才能提交。');
  }

  return issues;
}

function topicTitle(config: MeetingWorkbenchConfig, topicKey: string): string {
  return config.topics.find((topic) => topic.key === topicKey)?.title ?? topicKey;
}

function formatSegment(config: MeetingWorkbenchConfig, segment: MeetingVoiceSegment): string {
  return `${topicTitle(config, segment.topicKey)}｜${segment.speakerName}（${segment.speakerRole}）：${segment.revisedText.trim()}`;
}

function groupedDiscussion(config: MeetingWorkbenchConfig, segments: MeetingVoiceSegment[]): string {
  const confirmed = getConfirmedMeetingSegments(segments);
  return config.topics
    .map((topic) => {
      const topicSegments = confirmed.filter((segment) => segment.topicKey === topic.key);
      if (!topicSegments.length) return '';
      return `${topic.title}：${topicSegments.map((segment) => `${segment.speakerName}认为${segment.revisedText.trim()}`).join('；')}`;
    })
    .filter(Boolean)
    .join('\n');
}

function meetingInfo(config: MeetingWorkbenchConfig): string {
  const participantText = config.participants.map((person) => `${person.name}（${person.role}）`).join('、');
  return `会议时间：${config.meetingTime}；地点：${config.location}；主持人：${config.host}；参加人员：${participantText}。`;
}

function patientSummary(config: MeetingWorkbenchConfig): string {
  const patient = config.patient;
  return `${patient.bed} ${patient.name}，${patient.gender}，${patient.age}，住院号：${patient.admissionNo}，诊断：${patient.diagnosis ?? '待完善'}。`;
}

function buildDifficultCaseSections(
  config: MeetingWorkbenchConfig,
  segments: MeetingVoiceSegment[],
): ClinicalSection[] {
  const confirmed = getConfirmedMeetingSegments(segments);
  return [
    {
      key: 'meetingInfo',
      title: '会议基本信息',
      fieldKey: 'meetingInfo',
      text: meetingInfo(config),
      editable: true,
      source: 'manual',
      required: true,
    },
    {
      key: 'caseSummary',
      title: '病例摘要',
      fieldKey: 'caseSummary',
      text: `${patientSummary(config)}本次讨论围绕${config.topics.map((topic) => topic.focus).join('、')}展开。`,
      editable: true,
      source: 'emr',
      required: true,
    },
    {
      key: 'discussionOpinions',
      title: '讨论意见',
      fieldKey: 'discussionOpinions',
      text: confirmed.map((segment) => formatSegment(config, segment)).join('\n'),
      editable: true,
      source: 'asr',
      required: true,
    },
    {
      key: 'finalConclusion',
      title: '讨论结论',
      fieldKey: 'finalConclusion',
      text: config.draftConclusion || groupedDiscussion(config, segments),
      editable: true,
      source: 'manual',
      required: true,
    },
  ];
}

function buildDeathDiscussionSections(
  config: MeetingWorkbenchConfig,
  segments: MeetingVoiceSegment[],
): ClinicalSection[] {
  return [
    {
      key: 'meetingInfo',
      title: '会议基本信息',
      fieldKey: 'meetingInfo',
      text: meetingInfo(config),
      editable: true,
      source: 'manual',
      required: true,
    },
    {
      key: 'deathCaseReview',
      title: '死亡病例复盘',
      fieldKey: 'deathCaseReview',
      text: patientSummary(config),
      editable: true,
      source: 'emr',
      required: true,
    },
    {
      key: 'discussionReview',
      title: '讨论发言摘要',
      fieldKey: 'discussionReview',
      text: groupedDiscussion(config, segments),
      editable: true,
      source: 'asr',
      required: true,
    },
    {
      key: 'manualConclusion',
      title: '人工确认结论',
      fieldKey: 'manualConclusion',
      text: '',
      editable: true,
      source: 'manual',
      required: true,
    },
  ];
}

export function buildMeetingSections(
  config: MeetingWorkbenchConfig,
  segments: MeetingVoiceSegment[],
): ClinicalSection[] {
  const builders: Record<MeetingDocCode, () => ClinicalSection[]> = {
    DOC005: () => buildDifficultCaseSections(config, segments),
    DOC012: () => buildDeathDiscussionSections(config, segments),
  };
  return builders[config.docCode]();
}
