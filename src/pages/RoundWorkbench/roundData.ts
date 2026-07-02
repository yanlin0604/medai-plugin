import type { DocDefinition } from '../../config/docRegistry';
import type { RoundPatient, RoundVoiceSegment } from '../../services/types';

export type RoundDocCode = 'DOC003';

export const ROUND_DOC_CODES: RoundDocCode[] = ['DOC003'];

export interface RoundDocOption {
  code: RoundDocCode;
  name: string;
}

export const ROUND_DEMO_PATIENTS: RoundPatient[] = [
  {
    id: 'ZY20260001',
    name: '陈建国',
    gender: '男',
    age: '65岁',
    bedNo: '1201',
    diagnosis: '冠状动脉粥样硬化性心脏病，不稳定型心绞痛',
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: 'ZY20260001',
      displayName: '1201床 陈建国 / ZY20260001',
    },
  },
  {
    id: 'ZY20260002',
    name: '刘淑芬',
    gender: '女',
    age: '58岁',
    bedNo: '1202',
    diagnosis: '高血压病3级，高血压脑病',
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: 'ZY20260002',
      displayName: '1202床 刘淑芬 / ZY20260002',
    },
  },
];

export const ROUND_SEGMENTS: RoundVoiceSegment[] = [
  {
    id: 'seg-round-001',
    patientId: 'ZY20260001',
    targetDocCode: 'DOC003',
    startedAt: '09:10',
    endedAt: '09:12',
    originalText: '一二零一床陈建国，昨晚胸闷较前减轻，心率维持在七十八次左右，继续抗血小板和控压治疗。',
    revisedText: '1201床陈建国，昨晚胸闷较前减轻，心率维持在78次/分左右，继续抗血小板及控压治疗。',
    status: 'confirmed',
    speakerRole: '住院医师',
  },
  {
    id: 'seg-round-002',
    patientId: 'ZY20260002',
    targetDocCode: 'DOC003',
    startedAt: '09:35',
    endedAt: '09:38',
    originalText: '一二零二床刘淑芬，上级医师指出继续平稳降压，并重点评估靶器官损害情况。',
    revisedText: '1202床刘淑芬，上级医师查房指出继续平稳降压，并重点评估靶器官损害情况。',
    status: 'confirmed',
    speakerRole: '上级医师',
  },
  {
    id: 'seg-round-003',
    patientId: null,
    targetDocCode: 'DOC003',
    startedAt: '09:42',
    originalText: '患者说昨晚睡眠好一些，但是具体哪床还需要再确认。',
    revisedText: '患者诉昨晚睡眠较前改善，但当前片段未明确具体床号，需人工确认归属。',
    status: 'draft',
    speakerRole: '患者',
  },
];

export function buildRoundDocOptions(docs: Array<DocDefinition | undefined>): RoundDocOption[] {
  return docs
    .filter((doc): doc is DocDefinition => !!doc && ROUND_DOC_CODES.includes(doc.code as RoundDocCode))
    .map((doc) => ({ code: doc.code as RoundDocCode, name: doc.name }));
}

export function buildMockRoundSegment(
  index: number,
  patient: RoundPatient,
  docCode: RoundDocCode,
): RoundVoiceSegment {
  const senior = index % 2 === 1;
  const text = senior
    ? `${patient.bedNo}${patient.name}，上级医师查房后认为当前诊断基本明确，需继续观察主要症状变化并调整治疗计划。`
    : `${patient.bedNo}${patient.name}，今日查房精神状态较前改善，主要症状有缓解，继续当前治疗并复查相关指标。`;

  return {
    id: `seg-round-${Date.now()}-${index}`,
    patientId: patient.id,
    targetDocCode: docCode,
    startedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    originalText: text,
    revisedText: text,
    status: 'draft',
    speakerRole: senior ? '上级医师' : '住院医师',
  };
}
