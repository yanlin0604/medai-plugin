import type { ClinicalSection, RoundPatient, RoundVoiceSegment } from '../../services/types';
import type { RoundDocCode } from './roundData';

export function getConfirmedRoundSegments(
  segments: RoundVoiceSegment[],
  patientId: string,
  docCode: RoundDocCode,
): RoundVoiceSegment[] {
  return segments
    .filter((segment) => (
      segment.patientId === patientId
      && segment.targetDocCode === docCode
      && segment.status === 'confirmed'
      && segment.revisedText.trim()
    ))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function getRoundSubmitIssues(
  segments: RoundVoiceSegment[],
  patientId: string,
  docCode: RoundDocCode,
): string[] {
  const currentDocSegments = segments.filter((segment) => segment.targetDocCode === docCode);
  const unsafeSegments = currentDocSegments.filter((segment) => !segment.patientId || segment.status !== 'confirmed');
  const confirmedForPatient = getConfirmedRoundSegments(segments, patientId, docCode);
  const issues: string[] = [];

  if (!confirmedForPatient.length) {
    issues.push('请先确认至少 1 条当前患者、当前文书的查房语音片段。');
  }
  if (unsafeSegments.length > 0) {
    issues.push(`仍有 ${unsafeSegments.length} 条当前文书片段未归属或未确认，提交前需处理。`);
  }

  return issues;
}

function formatSegment(segment: RoundVoiceSegment): string {
  const time = segment.endedAt ? `${segment.startedAt}-${segment.endedAt}` : segment.startedAt;
  const role = segment.speakerRole ? `（${segment.speakerRole}）` : '';
  return `${time}${role} ${segment.revisedText.trim()}`;
}

function trimTerminalPunctuation(text: string) {
  return text.replace(/[。；;，,]+$/g, '');
}

function buildDailyCourseText(patient: RoundPatient, confirmedSegments: RoundVoiceSegment[]) {
  const evidence = confirmedSegments.map(formatSegment).map(trimTerminalPunctuation).join('；');
  return [
    `${patient.bedNo}${patient.name}，住院号${patient.identifiers.admissionNo}，入院诊断：${patient.diagnosis}。`,
    evidence ? `今日查房记录：${evidence}。` : '',
    '目前病情较前评估后继续观察，结合生命体征、检验及影像结果调整治疗方案。',
  ].filter(Boolean).join('');
}

function buildSeniorRoundText(patient: RoundPatient, confirmedSegments: RoundVoiceSegment[]) {
  const evidence = confirmedSegments.map(formatSegment).map(trimTerminalPunctuation).join('；');
  return [
    `上级医师查房对象：${patient.bedNo}${patient.name}，住院号${patient.identifiers.admissionNo}，诊断：${patient.diagnosis}。`,
    evidence ? `查房意见：${evidence}。` : '',
    '请责任医师按上级医师意见完善诊疗计划，并持续评估疗效及风险。',
  ].filter(Boolean).join('');
}

export function buildRoundSections(
  patient: RoundPatient,
  docCode: RoundDocCode,
  segments: RoundVoiceSegment[],
): ClinicalSection[] {
  const confirmedSegments = getConfirmedRoundSegments(segments, patient.id, docCode);
  const segmentText = confirmedSegments.map(formatSegment).join('\n');
  const isSeniorRound = docCode === 'DOC004';
  const finalText = isSeniorRound
    ? buildSeniorRoundText(patient, confirmedSegments)
    : buildDailyCourseText(patient, confirmedSegments);

  return [
    {
      key: 'patientIdentity',
      title: '患者标识',
      fieldKey: 'patientIdentity',
      text: `${patient.bedNo} ${patient.name}，${patient.gender}，${patient.age}，住院号：${patient.identifiers.admissionNo}，诊断：${patient.diagnosis}。`,
      editable: false,
      source: 'his',
      required: true,
    },
    {
      key: 'confirmedVoiceSegments',
      title: '已确认查房语音',
      fieldKey: 'confirmedVoiceSegments',
      text: segmentText,
      editable: true,
      source: 'asr',
      required: true,
    },
    {
      key: isSeniorRound ? 'seniorRoundOpinion' : 'roundAssessment',
      title: isSeniorRound ? '上级医师查房意见' : '病情评估',
      fieldKey: isSeniorRound ? 'seniorRoundOpinion' : 'roundAssessment',
      text: finalText,
      editable: true,
      source: 'ai',
      required: true,
    },
    {
      key: 'nextPlan',
      title: '下一步计划',
      fieldKey: 'nextPlan',
      text: isSeniorRound
        ? '落实上级医师查房意见，复核关键检查结果，必要时调整治疗方案。'
        : '继续当前治疗，动态观察症状、体征及复查指标变化。必要时请上级医师复核。',
      editable: true,
      source: 'manual',
      required: true,
    },
  ];
}
