import { DocDefinition } from '../../config/docRegistry';
import { Patient } from '../../stores/usePatientStore';
import { TimelineNode } from '../../components/clinical/ObjectiveTimeline';
import { IcdItem } from '../../components/clinical/IcdRecommend';
import { PatientBrief } from '../../components/clinical/EmrContextCard';

/** HIS 手术/补录类表单定义 */
export interface RecordForm {
  title: string;
  fields: { label: string; value?: string; placeholder?: string }[];
  contentLabel: string;
  /** 术后诊断字段标签（ICD 勾选自动填入），无则不显示 */
  diagnosisLabel?: string;
}

/** 范式二（事后多模态补录）完整配置 */
export interface RecordConfig {
  patient: PatientBrief;
  form: RecordForm;
  topCardText: string;
  timelineTitle: string;
  timeline: TimelineNode[];
  dictationTitle: string;
  dictationInit: string;
  dictationMock: string;
  icdTitle: string;
  icdItems: IcdItem[];
  draftLabel: string;
  draft: string;
  writebackLabel: string;
}

// ==================== 手术记录（DOC013）标杆数据 ====================
// 数据来源：doc_013_operation.html 原型

const operationConfig: RecordConfig = {
  patient: { name: '陈建国', gender: '男', age: '65岁', bed: '1201', admissionNo: 'ZY20260001', diagnosis: '冠状动脉粥样硬化性心脏病' },
  form: {
    title: '心血管内科 — 冠脉造影及介入术手术记录单',
    fields: [
      { label: '手术日期', value: '2026-05-28' },
      { label: '手术名称', value: '冠脉造影+球囊扩张成形术' },
      { label: '麻醉方式', value: '局部浸润麻醉' },
    ],
    contentLabel: '详细手术经过描述 (包含术中客观用药、穿刺路径、主观手术操作细节)',
    diagnosisLabel: '术后诊断',
  },
  topCardText: '陈建国 (男 / 65岁) · 术中事件提取与口述交叉拼装',
  timelineTitle: '手麻系统/手术医嘱客观时间轴静默集成',
  timeline: [
    { time: '14:00', text: '麻醉开始 (2%利多卡因局部浸润麻醉)', highlight: true },
    { time: '14:15', text: '右股动脉穿刺置管入鞘 (穿刺成功)', highlight: true },
    { time: '14:50', text: '术中予以肝素钠 3000 U 静推' },
    { time: '15:45', text: '手术结束，拔出鞘管，压迫止血包扎' },
  ],
  dictationTitle: '🎙️ 术后医生口述主观手术细节',
  dictationInit: '术中行冠脉造影示左前降支中段局限性狭窄约70%，予以 2.5*15mm 球囊加压至 10atm 扩张，过程顺利，复查无夹层...',
  dictationMock: '退鞘后穿刺点无活动性出血，右下肢足背动脉搏动可，患者无诉不适。',
  icdTitle: '术后诊断 ICD-10 AI推荐 (勾选后自动填入HIS)',
  icdItems: [
    { name: '冠心病', code: 'I25.1', confidence: 92 },
    { name: '支架植入术后状态', code: 'Z96.8', confidence: 78 },
    { name: '高血压', code: 'I10', confidence: 55 },
  ],
  draftLabel: '✨ AI 自动生成的术后病历草稿 (主客观数据拼装)',
  draft: '患者于14:00送入手术室，予以2%利多卡因行右腹股沟区局部浸润麻醉。麻醉成功后，于14:15常规行右股动脉穿刺，置管入鞘成功。送入造影导管，术中行冠脉造影示左前降支中段局限性狭窄约70%，术中追加肝素钠3000U抗凝。引入2.5*15mm球囊至前降支狭窄处，加压至10atm进行扩张。复查造影示前降支残余狭窄小于10%，前向血流 TIMI 3级，无内膜夹层。于15:45安全拔出鞘管，右股动脉穿刺处予以压迫止血并加压包扎，患者安返病房。',
  writebackLabel: '一键回写 EMR 手术记录 (F8)',
};

// ==================== 其他范式二文书（首程/抢救/会诊）通用兜底 ====================

function buildFallback(doc: DocDefinition, p: Patient): RecordConfig {
  return {
    patient: { name: p.name, gender: p.gender, age: p.age, bed: p.bedNo, admissionNo: p.id, diagnosis: p.diagnosis },
    form: {
      title: `${p.deptName} — ${doc.name}`,
      fields: [
        { label: '记录日期', value: '2026-05-28' },
        { label: '记录医师', value: p.doctor },
        { label: '事件时间窗', value: '系统自动识别' },
      ],
      contentLabel: `${doc.name}详细描述（客观时间轴 + 医生口述交叉拼装）`,
      diagnosisLabel: '相关诊断',
    },
    topCardText: `${p.name} (${p.gender} / ${p.age}) · 客观事件提取与口述交叉拼装`,
    timelineTitle: '医嘱/用药客观时间轴静默集成',
    timeline: [
      { time: '08:00', text: '系统自动拉取事件时间窗内首条医嘱', highlight: true },
      { time: '08:30', text: '关键用药与处置记录自动归集' },
      { time: '09:15', text: '生命体征与监护数据节点对齐' },
    ],
    dictationTitle: `🎙️ 医生口述${doc.name}主观细节`,
    dictationInit: '',
    dictationMock: '（口述）患者一般情况可，处置过程顺利，无特殊不良反应。',
    icdTitle: '诊断 ICD-10 AI推荐 (勾选后自动填入HIS)',
    icdItems: [
      { name: '冠心病', code: 'I25.1', confidence: 90 },
      { name: '高血压', code: 'I10', confidence: 62 },
    ],
    draftLabel: `✨ AI 自动生成的${doc.name}草稿 (主客观数据拼装)`,
    draft: `（AI 已基于客观医嘱时间轴与医生口述，交叉拼装生成 ${p.name} 的${doc.name}草稿，医生可在此微调后一键回写。）`,
    writebackLabel: `一键回写 EMR ${doc.name} (F8)`,
  };
}

/** 按文书取范式二配置（标杆 DOC013 用真实数据，其余兜底） */
export function getRecordConfig(doc: DocDefinition, currentPatient: Patient | null): RecordConfig {
  if (doc.code === 'DOC013') return operationConfig;
  if (currentPatient) return buildFallback(doc, currentPatient);
  return operationConfig;
}
