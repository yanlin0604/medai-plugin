import type { DocDefinition } from '../../config/docRegistry';
import type { Patient as StorePatient } from '../../stores/usePatientStore';
import type { ClinicalSection, MeetingConfig, MeetingVoiceSegment, PatientBrief } from '../../services/types';

export type MeetingDocCode = 'DOC005' | 'DOC012';

export const MEETING_DOC_CODES: MeetingDocCode[] = ['DOC005', 'DOC012'];

export interface MeetingTopic {
  key: string;
  title: string;
  focus: string;
}

export interface MeetingDocOption {
  code: MeetingDocCode;
  name: string;
}

export interface MeetingWorkbenchConfig extends Omit<MeetingConfig, 'sections'> {
  docCode: MeetingDocCode;
  title: string;
  meetingTime: string;
  location: string;
  host: string;
  patient: PatientBrief;
  topics: MeetingTopic[];
  initialSegments: MeetingVoiceSegment[];
  draftConclusion: string;
  riskNotice?: string;
  sections: ClinicalSection[];
}

const fallbackPatient: PatientBrief = {
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bed: '1201',
  admissionNo: 'ZY20260001',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

function resolveMeetingPatient(currentPatient: StorePatient | null): PatientBrief {
  if (!currentPatient) return fallbackPatient;
  return {
    name: currentPatient.name,
    gender: currentPatient.gender,
    age: currentPatient.age,
    bed: currentPatient.bedNo,
    admissionNo: currentPatient.id,
    diagnosis: currentPatient.diagnosis,
  };
}

const participants = [
  { name: '林志远', role: '主持医师' },
  { name: '赵敏', role: '上级医师' },
  { name: '周岚', role: '责任护士' },
  { name: '王珂', role: '住院医师' },
];

export function buildMeetingDocOptions(docs: Array<DocDefinition | undefined>): MeetingDocOption[] {
  return docs
    .filter((doc): doc is DocDefinition => !!doc && MEETING_DOC_CODES.includes(doc.code as MeetingDocCode))
    .map((doc) => ({ code: doc.code as MeetingDocCode, name: doc.name }));
}

export function buildMeetingConfigs(currentPatient: StorePatient | null): Record<MeetingDocCode, MeetingWorkbenchConfig> {
  const patient = resolveMeetingPatient(currentPatient);
  return {
    DOC005: {
      docCode: 'DOC005',
      title: '疑难病例讨论记录',
      meetingTime: '2026-06-08 15:30',
      location: '心血管内科示教室',
      host: '林志远',
      patientId: patient.admissionNo,
      patient,
      participants,
      conclusionRequiresManualConfirm: false,
      topics: [
        { key: 'diagnosis', title: '诊断分歧', focus: '冠脉病变严重程度与胸痛诱因' },
        { key: 'treatment', title: '治疗方案', focus: '抗栓、调脂和介入评估时机' },
        { key: 'risk', title: '风险控制', focus: '出血风险、肾功能和围术期管理' },
      ],
      initialSegments: [
        {
          id: 'meet-005-001',
          speakerName: '赵敏',
          speakerRole: '上级医师',
          topicKey: 'diagnosis',
          originalText: '患者胸痛反复，冠脉基础病明确，需要区分不稳定心绞痛和非心源性因素。',
          revisedText: '患者反复胸痛，冠心病基础明确，需重点鉴别不稳定型心绞痛与非心源性胸痛因素。',
          status: 'confirmed',
        },
        {
          id: 'meet-005-002',
          speakerName: '王珂',
          speakerRole: '住院医师',
          topicKey: 'treatment',
          originalText: '建议完善肌钙蛋白动态复查，结合肾功能评估是否做冠脉造影。',
          revisedText: '建议完善肌钙蛋白动态复查，结合肾功能评估冠脉造影时机。',
          status: 'confirmed',
        },
      ],
      draftConclusion: '经讨论，倾向按冠心病不稳定型心绞痛高危患者管理，完善动态心肌酶、心电图及肾功能评估后决定介入检查时机。',
      sections: [],
    },
    DOC012: {
      docCode: 'DOC012',
      title: '死亡讨论记录',
      meetingTime: '2026-06-08 16:40',
      location: '科室质控会议室',
      host: '赵敏',
      patientId: patient.admissionNo,
      patient,
      participants,
      conclusionRequiresManualConfirm: true,
      riskNotice: '死亡讨论结论需主持医师人工确认后才能提交。',
      topics: [
        { key: 'deathCause', title: '死亡原因复盘', focus: '直接死亡原因与基础疾病关系' },
        { key: 'careReview', title: '诊疗过程复盘', focus: '抢救流程、医嘱执行与沟通记录' },
        { key: 'improvement', title: '改进意见', focus: '病情预警、告知和质控闭环' },
      ],
      initialSegments: [
        {
          id: 'meet-012-001',
          speakerName: '赵敏',
          speakerRole: '上级医师',
          topicKey: 'careReview',
          originalText: '抢救启动及时，后续要补充记录家属沟通和病情变化时间点。',
          revisedText: '抢救启动及时，需补充核对家属沟通记录及关键病情变化时间点。',
          status: 'confirmed',
        },
        {
          id: 'meet-012-002',
          speakerName: '林志远',
          speakerRole: '主持医师',
          topicKey: 'deathCause',
          originalText: '死亡原因还要结合最终检查和病程记录，不能直接用 AI 结论。',
          revisedText: '死亡原因需结合最终检查、病程记录及上级医师意见人工确认，不能直接采用自动结论。',
          status: 'confirmed',
        },
      ],
      draftConclusion: '',
      sections: [],
    },
  };
}

export function buildMockMeetingSegment(
  index: number,
  config: MeetingWorkbenchConfig,
): MeetingVoiceSegment {
  const topic = config.topics[index % config.topics.length];
  const speaker = config.participants[index % config.participants.length];
  const text = config.docCode === 'DOC012'
    ? `${speaker.name}围绕${topic.title}提出：需复核关键时间点、诊疗记录和沟通记录，结论由主持医师人工确认。`
    : `${speaker.name}围绕${topic.title}提出：${topic.focus}仍需结合检查结果和患者当前风险综合判断。`;

  return {
    id: `meet-${Date.now()}-${index}`,
    speakerName: speaker.name,
    speakerRole: speaker.role,
    topicKey: topic.key,
    originalText: text,
    revisedText: text,
    status: 'draft',
  };
}
