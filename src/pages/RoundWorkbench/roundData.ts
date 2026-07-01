import type { DocDefinition } from '../../config/docRegistry';
import type { Patient as StorePatient } from '../../stores/usePatientStore';
import type { RoundPatient, RoundVoiceSegment } from '../../services/types';

export type RoundDocCode = 'DOC003';

export const ROUND_DOC_CODES: RoundDocCode[] = ['DOC003'];

export interface RoundDocOption {
  code: RoundDocCode;
  name: string;
}

const SAMPLE_PATIENTS: RoundPatient[] = [
  {
    id: 'ZY20260608001',
    name: '周明',
    gender: '男',
    age: '67岁',
    bedNo: '12床',
    diagnosis: '慢性阻塞性肺疾病急性加重',
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: 'ZY20260608001',
      displayName: '12床 周明 / ZY20260608001',
    },
  },
  {
    id: 'ZY20260608002',
    name: '陈婧',
    gender: '女',
    age: '58岁',
    bedNo: '15床',
    diagnosis: '2型糖尿病伴感染',
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: 'ZY20260608002',
      displayName: '15床 陈婧 / ZY20260608002',
    },
  },
  {
    id: 'ZY20260608003',
    name: '林海',
    gender: '男',
    age: '72岁',
    bedNo: '18床',
    diagnosis: '脑梗死恢复期',
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: 'ZY20260608003',
      displayName: '18床 林海 / ZY20260608003',
    },
  },
];

export const ROUND_SEGMENTS: RoundVoiceSegment[] = [
  {
    id: 'seg-round-001',
    patientId: 'ZY20260608001',
    targetDocCode: 'DOC003',
    startedAt: '09:10',
    endedAt: '09:12',
    originalText: '十二床周明，夜间咳嗽较前减轻，氧饱和度维持九十五左右，继续雾化和抗感染。',
    revisedText: '12床周明，夜间咳嗽较前减轻，SpO2维持约95%，继续雾化吸入及抗感染治疗。',
    status: 'confirmed',
    speakerRole: '住院医师',
  },
  {
    id: 'seg-round-002',
    patientId: 'ZY20260608003',
    targetDocCode: 'DOC003',
    startedAt: '09:35',
    endedAt: '09:38',
    originalText: '十八床林海，上级医师指出肌力恢复慢，需要继续康复训练并注意吞咽风险。',
    revisedText: '18床林海，上级医师查房指出肢体肌力恢复较慢，需继续康复训练，并重点评估吞咽风险。',
    status: 'confirmed',
    speakerRole: '上级医师',
  },
  {
    id: 'seg-round-003',
    patientId: null,
    targetDocCode: 'DOC003',
    startedAt: '09:42',
    originalText: '患者说今天胃口好一点，血糖还要继续看。',
    revisedText: '患者诉今日食欲较前改善，需继续监测血糖波动。',
    status: 'draft',
    speakerRole: '患者',
  },
];

export function buildRoundPatients(currentPatient: StorePatient | null): RoundPatient[] {
  if (!currentPatient) return SAMPLE_PATIENTS;

  const active: RoundPatient = {
    id: currentPatient.id,
    name: currentPatient.name,
    gender: currentPatient.gender,
    age: currentPatient.age,
    bedNo: currentPatient.bedNo,
    diagnosis: currentPatient.diagnosis,
    targetDocCodes: ['DOC003'],
    identifiers: {
      admissionNo: currentPatient.id,
      displayName: `${currentPatient.bedNo} ${currentPatient.name} / ${currentPatient.id}`,
    },
  };

  return [active, ...SAMPLE_PATIENTS.filter((patient) => patient.id !== active.id)];
}

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
