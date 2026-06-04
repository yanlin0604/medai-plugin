// 入院记录（DOC001）样例数据。
//
// ⚠️ 仅为接口层的「样例实现」数据源，供前端工作流在后端就绪前真实跑通。
// 数据临床内容源自需求原型 doc_001_admission.html。
// TODO: 后端就绪后，本文件由 clinicalService 的真实接口实现替代。

import type {
  PatientBrief,
  ObjectiveItem,
  TranscriptSegment,
  IcdItem,
  QcResult,
} from '../types';

/** 样例患者简要信息 */
export const admissionPatient: PatientBrief = {
  name: '张三', gender: '男', age: '65岁', bed: '1床', admissionNo: '10082',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

/** LIS 检验 & PACS 影像近期客观报告 */
export const admissionObjective: ObjectiveItem[] = [
  {
    name: '心肌肌钙蛋白 T (cTnT) · 急诊化验',
    status: '↑ 异常', statusColor: '#EF4444',
    value: '1.45 ng/ml', valueColor: '#EF4444',
    ref: '参考区间 < 0.03 ng/ml',
    desc: 'cTnT 显著升高，高度提示心肌损伤，建议结合主诉排查心肌梗死。',
    danger: true,
  },
  {
    name: '十二导联心电图 (ECG) · 急诊影像',
    status: '● 已同步',
    value: '窦性心律，ST-T 改变',
    desc: 'V3-V5 导联 ST 段压低 0.15mV，T 波倒置，未见病理性 Q 波。',
  },
];

/** 床旁问诊录音转写（[xxx已脱敏] 占位符将由组件渲染为脱敏高亮） */
export const admissionTranscript: TranscriptSegment[] = [
  { speaker: '医生', text: '老人家，这次是为什么不舒服来住院啊？' },
  { speaker: '患者', text: '最近3天总是心前区痛，闷得很。昨天加重了，痛得出汗，气喘不过来。我留的电话是 [手机号已脱敏]，家住在 [地址已脱敏]。' },
  { speaker: '医生', text: '平时有高血压病史吗？吃什么药？抽烟不？' },
  { speaker: '患者', text: '有高血压10多年了，一直每天吃一粒硝苯地平，抽烟有30多年了，一天一包。' },
];

/** ICD-10 诊断候选 */
export const admissionIcd: IcdItem[] = [
  { name: '冠状动脉粥样硬化性心脏病', code: 'I25.101', confidence: 96 },
  { name: '急性非ST段抬高型心肌梗死', code: 'I21.401', confidence: 89 },
  { name: '高血压病3级 (极高危)', code: 'I10.x00', confidence: 85 },
];

/** 三级质控结果 */
export const admissionQc: QcResult = {
  grade: '甲级', score: 94,
  bubbles: [
    { level: 'blue', tag: '[提示]', text: '主诉「胸痛3天，加重伴大汗」与诊断「心肌梗死」表现一致，已高亮抽取支持证据。' },
    { level: 'yellow', tag: '[警告]', text: '患者有10年高血压史，体格检查中心脏浊音界未描述，请核查是否已进行。' },
    { level: 'red', tag: '[严重]', text: '初诊含高血压病3级，但未记录高血压眼底病变筛查结论，可能影响甲级病历评定率。' },
  ],
};
