import type { DocDefinition } from '../../config/docRegistry';
import type { Patient as StorePatient } from '../../stores/usePatientStore';
import type { ClinicalSection, PatientBrief } from '../../services/types';

export interface DeathRecordField {
  key: string;
  label: string;
  value: string;
  placeholder: string;
  required: boolean;
  source: 'his' | 'emr' | 'manual';
}

export interface DeathRecordConfig {
  docCode: string;
  docName: string;
  patient: PatientBrief;
  fields: DeathRecordField[];
  sections: ClinicalSection[];
  auditHints: string[];
}

const fallbackPatient: PatientBrief = {
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bed: '1201',
  admissionNo: 'ZY20260001',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

function resolvePatient(currentPatient: StorePatient | null): PatientBrief {
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

export function buildDeathRecordConfig(
  doc: DocDefinition,
  currentPatient: StorePatient | null,
): DeathRecordConfig {
  const patient = resolvePatient(currentPatient);
  return {
    docCode: doc.code,
    docName: doc.name,
    patient,
    fields: [
      {
        key: 'deathTime',
        label: '死亡时间',
        value: '',
        placeholder: 'YYYY-MM-DD HH:mm',
        required: true,
        source: 'manual',
      },
      {
        key: 'deathPlace',
        label: '死亡地点',
        value: '',
        placeholder: '如：心血管内科病区',
        required: true,
        source: 'manual',
      },
      {
        key: 'deathDiagnosis',
        label: '死亡诊断',
        value: '',
        placeholder: '由医生依据病历人工填写',
        required: true,
        source: 'manual',
      },
      {
        key: 'directCause',
        label: '直接死亡原因',
        value: '',
        placeholder: '不得由 AI 自动生成',
        required: true,
        source: 'manual',
      },
      {
        key: 'familyNotification',
        label: '家属告知',
        value: '',
        placeholder: '记录告知对象、时间和主要内容',
        required: true,
        source: 'manual',
      },
      {
        key: 'seniorReviewer',
        label: '上级审核医师',
        value: '',
        placeholder: '填写审核医师姓名',
        required: true,
        source: 'manual',
      },
    ],
    sections: [
      {
        key: 'patientIdentity',
        title: '患者标识',
        fieldKey: 'patientIdentity',
        text: `${patient.bed} ${patient.name}，${patient.gender}，${patient.age}，住院号：${patient.admissionNo}，入院诊断：${patient.diagnosis ?? '待完善'}。`,
        editable: false,
        source: 'his',
        required: true,
      },
      {
        key: 'hospitalizationCourse',
        title: '住院诊疗经过',
        fieldKey: 'hospitalizationCourse',
        text: '',
        editable: true,
        source: 'manual',
        required: true,
      },
      {
        key: 'rescueCourse',
        title: '抢救经过',
        fieldKey: 'rescueCourse',
        text: '',
        editable: true,
        source: 'manual',
        required: true,
      },
      {
        key: 'deathCauseAnalysis',
        title: '死亡原因分析',
        fieldKey: 'deathCauseAnalysis',
        text: '',
        editable: true,
        source: 'manual',
        required: true,
      },
      {
        key: 'familyCommunication',
        title: '家属沟通记录',
        fieldKey: 'familyCommunication',
        text: '',
        editable: true,
        source: 'manual',
        required: true,
      },
    ],
    auditHints: [
      '死亡原因、死亡诊断和诊疗结论必须由医生人工填写。',
      '提交前需核对抢救记录、医嘱执行、病程记录和家属告知记录。',
      '上级医师审核确认前禁止提交。',
    ],
  };
}
