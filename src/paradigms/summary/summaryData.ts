import { DocDefinition } from '../../config/docRegistry';
import { Patient } from '../../stores/usePatientStore';
import { SummaryPoint } from './HistoryPullCard';
import { PatientBrief } from '../../components/clinical/EmrContextCard';

/** 范式一单个患者的汇总数据 */
export interface SummaryPatient extends PatientBrief {
  pulledDocs: string[];
  points: SummaryPoint[];
  draft: string;
}

/** HIS 文书表单定义 */
export interface SummaryForm {
  title: string;
  fields: { label: string; value?: string; placeholder?: string }[];
  contentLabel: string;
}

/** 范式一（系统自动汇总）完整配置 */
export interface SummaryConfig {
  form: SummaryForm;
  historyTitle: string;
  draftLabel: string;
  writebackLabel: string;
  /** 是否多患者交接（交接班=true，出院/转科=false） */
  multiPatient: boolean;
  patients: SummaryPatient[];
}

// ==================== 交接班记录（DOC006）标杆数据 ====================
// 数据来源：doc_006_shift.html 原型 patientsData

const shiftConfig: SummaryConfig = {
  form: {
    title: '心血管内科病区 — 医生交接班记录单',
    fields: [
      { label: '交班日期与时间', value: '2026-05-28 17:30' },
      { label: '交班医师', value: '张建国' },
      { label: '接班医师', placeholder: '接班医生手写签章' },
    ],
    contentLabel: '交班记录内容 (包含：病情要点、今日用药调整、接班监控待办重点)',
  },
  historyTitle: 'EMR 历史前序病历静默集成拉取 (近3天)',
  draftLabel: '✨ AI 自动提炼生成的交接班草稿',
  writebackLabel: '一键回写 EMR 交接班记录 (F8)',
  multiPatient: true,
  patients: [
    {
      name: '张三', gender: '男', age: '65岁', bed: '1床', admissionNo: '10082', diagnosis: '急性冠脉综合征',
      pulledDocs: ['入院记录', '近三日病程记录', '手术记录'],
      points: [
        { tag: 'danger', label: '[危急重点]', text: '急查心肌酶谱高，肌钙蛋白T：1.45ng/ml显著升高。' },
        { tag: 'warning', label: '[方案调整]', text: '今日医嘱新增：低分子肝素抗凝治疗。' },
        { tag: 'primary', label: '[待办注意事项]', text: '接班需密切监护ECG及患者是否反复心前区胸痛。' },
      ],
      draft: '患者为65岁老年男性，因"间断性胸痛3天，加重1天"入院。今日已行心电监护及抗凝治疗。目前病情要点：心前区压榨痛间断发作，肌钙蛋白T显著升高。今日用药调整：新开立低分子肝素皮下注射抗凝。接班注意事项：夜间需严密监测心电图（ECG），注意患者有无反复胸痛、大汗等心梗前兆症状，若有不适及时复查心肌酶。',
    },
    {
      name: '王五', gender: '男', age: '58岁', bed: '3床', admissionNo: '10095', diagnosis: '高血压性心脏病',
      pulledDocs: ['入院记录', '近三日病程记录', '心脏超声报告'],
      points: [
        { tag: 'warning', label: '[病情变化]', text: '今日血压波动明显，最高达180/110mmHg，已予硝苯地平控释片口服。' },
        { tag: 'primary', label: '[待办注意事项]', text: '接班需持续监测血压变化，注意有无头晕、胸闷症状。' },
        { tag: 'danger', label: '[危急重点]', text: '合并左心室肥厚，心超示EF值52%，需警惕心衰加重。' },
      ],
      draft: '患者为58岁男性，因"发现血压升高伴头晕1周"入院。今日血压波动明显，最高180/110mmHg，已予硝苯地平控释片口服降压。合并左心室肥厚，心超示EF值52%。接班注意事项：夜间需持续监测血压变化趋势，注意患者有无头晕、胸闷等不适，若血压持续偏高需考虑调整降压方案。',
    },
    {
      name: '李四', gender: '女', age: '72岁', bed: '5床', admissionNo: '10110', diagnosis: '慢性心力衰竭急性加重',
      pulledDocs: ['入院记录', '近三日病程记录', '电解质检验报告'],
      points: [
        { tag: 'danger', label: '[危急重点]', text: '今日端坐呼吸，双肺湿啰音明显增加，予呋塞米40mg静推。' },
        { tag: 'warning', label: '[方案调整]', text: '利尿剂方案由口服改为静脉，并加量观察尿量。' },
        { tag: 'primary', label: '[待办注意事项]', text: '接班需记录24小时出入量，警惕电解质紊乱，尤其是低钾血症。' },
      ],
      draft: '患者为72岁老年女性，因"慢性心力衰竭急性加重，端坐呼吸不能平卧"入院。今日端坐呼吸明显，双肺湿啰音增加，予呋塞米40mg静脉推注利尿。利尿方案由口服改为静脉加量。接班注意事项：夜间需严格记录24小时出入量，密切监测尿量变化，警惕低钾血症等电解质紊乱，必要时复查电解质。',
    },
  ],
};

// ==================== 其他范式一文书（出院/转科/阶段小结）通用兜底 ====================

function buildFallback(doc: DocDefinition, p: Patient): SummaryConfig {
  return {
    form: {
      title: `${p.deptName} — ${doc.name}`,
      fields: [
        { label: '记录日期', value: '2026-05-28' },
        { label: '记录医师', value: p.doctor },
        { label: '审核医师', placeholder: '上级医师签章' },
      ],
      contentLabel: `${doc.name}内容（系统自动汇总该患者既往病历）`,
    },
    historyTitle: 'EMR 全量历史病历静默集成拉取',
    draftLabel: `✨ AI 自动汇总生成的${doc.name}草稿`,
    writebackLabel: `一键回写 EMR ${doc.name} (F8)`,
    multiPatient: false,
    patients: [
      {
        name: p.name, gender: p.gender, age: p.age, bed: p.bedNo, admissionNo: p.id, diagnosis: p.diagnosis,
        pulledDocs: ['入院记录', '全程病程记录', '检验汇总', '医嘱单'],
        points: [
          { tag: 'primary', label: '[住院经过]', text: '系统已汇总入院至今全部病程要点与诊疗经过。' },
          { tag: 'warning', label: '[方案沿革]', text: '已自动提炼住院期间用药与治疗方案的关键调整。' },
          { tag: 'danger', label: '[关注重点]', text: '已标记需在本文书中重点交代的危急值与异常指标。' },
        ],
        draft: `（AI 已基于 ${p.name} 的全量 EMR 历史自动汇总生成${doc.name}草稿，医生可在此微调后一键回写。）`,
      },
    ],
  };
}

/** 按文书取范式一配置（标杆 DOC006 用真实数据，其余兜底） */
export function getSummaryConfig(doc: DocDefinition, currentPatient: Patient | null): SummaryConfig {
  if (doc.code === 'DOC006') return shiftConfig;
  if (currentPatient) return buildFallback(doc, currentPatient);
  return shiftConfig; // 极端兜底
}
