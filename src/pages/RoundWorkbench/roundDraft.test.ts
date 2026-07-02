import { describe, expect, it } from 'vitest';
import type { RoundPatient, RoundVoiceSegment } from '../../services/types';
import { buildRoundSections, getConfirmedRoundSegments, getRoundSubmitIssues } from './roundDraft';

const patientA: RoundPatient = {
  id: 'ZY20260001',
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bedNo: '1201',
  diagnosis: '冠状动脉粥样硬化性心脏病',
  targetDocCodes: ['DOC003'],
  identifiers: {
    admissionNo: 'ZY20260001',
    displayName: '1201床 陈建国 / ZY20260001',
  },
};

const patientB: RoundPatient = {
  id: 'ZY20260002',
  name: '刘淑芬',
  gender: '女',
  age: '58岁',
  bedNo: '1202',
  diagnosis: '高血压病3级',
  targetDocCodes: ['DOC003'],
  identifiers: {
    admissionNo: 'ZY20260002',
    displayName: '1202床 刘淑芬 / ZY20260002',
  },
};

const segments: RoundVoiceSegment[] = [
  {
    id: 'right',
    patientId: 'ZY20260001',
    targetDocCode: 'DOC003',
    startedAt: '09:10',
    revisedText: '1201床陈建国今日胸闷减轻，继续抗血小板治疗。',
    originalText: '一二零一床陈建国今日胸闷减轻继续抗血小板治疗',
    status: 'confirmed',
  },
  {
    id: 'wrong-patient',
    patientId: 'ZY20260002',
    targetDocCode: 'DOC003',
    startedAt: '09:11',
    revisedText: '1202床刘淑芬血压仍需继续观察。',
    originalText: '一二零二床刘淑芬血压仍需继续观察',
    status: 'confirmed',
  },
  {
    id: 'wrong-doc',
    patientId: 'ZY20260001',
    targetDocCode: 'DOC004',
    startedAt: '09:12',
    revisedText: '上级医师意见不应进入日常病程。',
    originalText: '上级医师意见',
    status: 'confirmed',
  },
  {
    id: 'draft',
    patientId: 'ZY20260001',
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
    expect(voiceSection?.text).toContain('1201床陈建国今日胸闷减轻');
    expect(voiceSection?.text).not.toContain('1202床刘淑芬');
    expect(voiceSection?.text).not.toContain('待确认内容');
  });

  it('blocks submit when current document has unconfirmed or unbound segments', () => {
    const issues = getRoundSubmitIssues(segments, patientA.id, 'DOC003');

    expect(issues).toContain('仍有 2 条当前文书片段未归属或未确认，提交前需处理。');
  });

  it('requires at least one confirmed segment for selected patient', () => {
    const issues = getRoundSubmitIssues([], patientB.id, 'DOC003');

    expect(issues).toContain('请先确认至少 1 条当前患者、当前文书的查房语音片段。');
  });
});
