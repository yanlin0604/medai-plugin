import type { Patient } from '../../stores/usePatientStore';
import type { IcdItem } from '../../components/clinical/IcdRecommend';

export interface DischargePoint {
  tag: 'primary' | 'warning' | 'danger' | 'success';
  label: string;
  text: string;
}

export interface DischargeSection {
  section: string;
  text: string;
  source: 'HIS' | 'EMR' | 'LIS' | 'PACS' | '医嘱' | 'AI';
  hint?: string;
}

export interface DischargeCase {
  pulledDocs: string[];
  points: DischargePoint[];
  icdCandidates: IcdItem[];
  sections: DischargeSection[];
  adviceSuggestion: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const dischargeIcdCandidates: IcdItem[] = [
  { name: '冠状动脉粥样硬化性心脏病', code: 'I25.101', confidence: 96 },
  { name: '急性非ST段抬高型心肌梗死', code: 'I21.401', confidence: 91 },
  { name: '高血压3级（很高危）', code: 'I10.x05', confidence: 86 },
];

const admissionDiagnosisCodes: Record<string, string> = {
  冠状动脉粥样硬化性心脏病: 'I25.101',
};

export function buildDischargeCase(patient: Patient): DischargeCase {
  const dischargeDate = addDays(patient.admissionDate, patient.admissionDays);
  const admissionDiagnosisCode = admissionDiagnosisCodes[patient.diagnosis];
  const patientLine = `姓名：${patient.name}，性别：${patient.gender}，年龄：${patient.age}，床位：${patient.bedNo}，住院号：${patient.id}，科室：${patient.deptName}。`;

  return {
    pulledDocs: ['入院记录', '首次病程记录', '全程病程记录', '检验汇总', '影像报告', '长期/临时医嘱单'],
    points: [
      { tag: 'primary', label: '[入院主因]', text: `因“间断性胸痛3天，加重1天”入院，入院诊断为${patient.diagnosis}。` },
      { tag: 'danger', label: '[关键异常]', text: '住院期间肌钙蛋白T最高1.45ng/ml，提示心肌损伤，已纳入出院诊断核对。' },
      { tag: 'warning', label: '[治疗沿革]', text: '抗血小板、抗凝、调脂稳定斑块及控制血压治疗后症状缓解。' },
      { tag: 'success', label: '[出院状态]', text: '近24小时无持续胸痛，生命体征平稳，具备出院评估条件。' },
    ],
    icdCandidates: dischargeIcdCandidates,
    sections: [
      {
        section: '患者基本信息',
        source: 'HIS',
        hint: 'HIS同步',
        text: patientLine,
      },
      {
        section: '入院日期',
        source: 'HIS',
        hint: 'HIS同步',
        text: patient.admissionDate,
      },
      {
        section: '出院日期',
        source: 'HIS',
        hint: 'HIS同步',
        text: dischargeDate,
      },
      {
        section: '入院情况',
        source: 'EMR',
        hint: '入院记录+首程汇总',
        text: `患者因间断性胸痛3天、加重1天入院。入院时诉心前区压榨样疼痛，伴大汗、气促。入院后结合心电图及心肌酶谱异常，考虑${patient.diagnosis}相关急性冠脉事件。`,
      },
      {
        section: '入院诊断',
        source: 'EMR',
        hint: '入院记录同步',
        text: admissionDiagnosisCode ? `${patient.diagnosis}（${admissionDiagnosisCode}）` : patient.diagnosis,
      },
      {
        section: '诊疗经过',
        source: 'EMR',
        hint: '全程病程+医嘱汇总',
        text: '入院后予心电监护、抗血小板聚集、抗凝、调脂稳定斑块、改善心肌供血及控制血压等治疗。动态复查心肌酶谱及心电图，胸痛症状较前缓解，未再出现持续性胸痛。住院期间严密观察生命体征及出入量，治疗过程顺利。',
      },
      {
        section: '出院诊断',
        source: 'AI',
        hint: '待医生勾选确认',
        text: '待确认出院诊断。',
      },
      {
        section: '出院情况',
        source: 'AI',
        hint: 'AI建议，需医生审核',
        text: '患者目前一般情况可，胸痛较前缓解，生命体征平稳，饮食睡眠可，具备出院条件。',
      },
      {
        section: '出院医嘱',
        source: 'AI',
        hint: 'AI建议，需医生审核',
        text: '出院后建议遵医嘱规律服药，门诊随诊，若再发胸痛、胸闷、气促等不适及时就诊。',
      },
      {
        section: '医师签名',
        source: 'HIS',
        hint: '医生账号同步',
        text: patient.doctor,
      },
    ],
    adviceSuggestion: '出院后继续遵医嘱口服抗血小板、调脂稳定斑块及降压等药物；低盐低脂饮食，避免劳累及情绪激动；1-2周心内科门诊复诊，复查心电图、血脂、肝肾功能及心肌酶谱；若出现持续胸痛、胸闷、大汗、气促等症状，应立即急诊就诊。',
  };
}
