import { describe, expect, it } from 'vitest';
import type { RoundPatient, RoundVoiceSegment } from '../../services/types';
import { buildRoundSections, getConfirmedRoundSegments, getRoundSubmitIssues } from './roundDraft';

const patientA: RoundPatient = {
  id: 'ZY-A',
  name: '周明',
  gender: '男',
  age: '67岁',
  bedNo: '12床',
  diagnosis: '慢阻肺急性加重',
  targetDocCodes: ['DOC003', 'DOC004'],
  identifiers: {
    admissionNo: 'ZY-A',
    displayName: '12床 周明 / ZY-A',
  },
};

const patientB: RoundPatient = {
  id: 'ZY-B',
  name: '陈婧',
  gender: '女',
  age: '58岁',
  bedNo: '15床',
  diagnosis: '2型糖尿病',
  targetDocCodes: ['DOC003'],
  identifiers: {
    admissionNo: 'ZY-B',
    displayName: '15床 陈婧 / ZY-B',
  },
};

const segments: RoundVoiceSegment[] = [
  {
    id: 'right',
    patientId: 'ZY-A',
    targetDocCode: 'DOC003',
    startedAt: '09:10',
    revisedText: '12床周明今日咳嗽减轻，继续抗感染。',
    originalText: '十二床周明今日咳嗽减轻继续抗感染',
    status: 'confirmed',
  },
  {
    id: 'wrong-patient',
    patientId: 'ZY-B',
    targetDocCode: 'DOC003',
    startedAt: '09:11',
    revisedText: '15床陈婧血糖仍需观察。',
    originalText: '十五床陈婧血糖仍需观察',
    status: 'confirmed',
  },
  {
    id: 'wrong-doc',
    patientId: 'ZY-A',
    targetDocCode: 'DOC004',
    startedAt: '09:12',
    revisedText: '上级医师意见不应进入日常病程。',
    originalText: '上级医师意见',
    status: 'confirmed',
  },
  {
    id: 'draft',
    patientId: 'ZY-A',
    targetDocCode: 'DOC003',
    startedAt: '09:13',
    revisedText: '待确认内容。',
    originalText: '待确认内容',
    status: 'draft',
  },
  {
    id: 'unbound',
    patientId: null,
    targetDocCode: 'DOC003',
    startedAt: '09:14',
    revisedText: '未归属内容。',
    originalText: '未归属内容',
    status: 'draft',
  },
];

describe('roundDraft', () => {
  it('uses only current patient, current document, confirmed segments', () => {
    const confirmed = getConfirmedRoundSegments(segments, patientA.id, 'DOC003');
    const sections = buildRoundSections(patientA, 'DOC003', segments);
    const voiceSection = sections.find((section) => section.key === 'confirmedVoiceSegments');

    expect(confirmed.map((segment) => segment.id)).toEqual(['right']);
    expect(voiceSection?.text).toContain('12床周明今日咳嗽减轻');
    expect(voiceSection?.text).not.toContain('15床陈婧');
    expect(voiceSection?.text).not.toContain('待确认内容');
  });

  it('blocks submit when current document has unconfirmed or unbound segments', () => {
    const issues = getRoundSubmitIssues(segments, patientA.id, 'DOC003');

    expect(issues).toContain('仍有 2 条当前文书片段未归属或未确认，提交前需处理。');
  });

  it('requires at least one confirmed segment for selected patient', () => {
    const issues = getRoundSubmitIssues(segments, patientB.id, 'DOC004');

    expect(issues).toContain('请先确认至少 1 条当前患者、当前文书的查房语音片段。');
  });
});
