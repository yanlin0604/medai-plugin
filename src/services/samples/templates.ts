// 文书模板样例数据（字段 schema）。
//
// ⚠️ 接口层「样例实现」数据源：声明每类文书由哪些字段构成、如何录入与渲染。
// 真实环境由后台按 docCode 下发可配置模板，替换 clinicalService.getDocTemplate 实现即可，
// 前端按字段动态渲染，新增/调整字段无需改代码。
// TODO: 后端就绪后接模板配置服务。

import type { DocTemplate } from '../types';

/** 入院记录（DOC001）字段模板 */
export const admissionTemplate: DocTemplate = {
  docCode: 'DOC001',
  version: 'v1.0',
  title: '入院记录',
  fields: [
    {
      key: 'patientInfo', label: '患者基本信息', section: '患者基本信息',
      source: 'his', required: true, inputType: 'static',
      staticText: '姓名：张三，性别：男，年龄：65岁，床位：1床，住院号：10082，入院诊断：冠状动脉粥样硬化性心脏病。',
    },
    {
      key: 'chiefComplaint', label: '主诉', section: '主诉',
      source: 'asr', required: true, inputType: 'static', dictatable: true,
      staticText: '间断性心前区疼痛3天，加重伴大汗、气促1天。',
    },
    {
      key: 'presentIllness', label: '现病史', section: '现病史',
      source: 'asr', required: true, inputType: 'static', dictatable: true,
      staticText:
        '患者于3天前无明显诱因出现心前区疼痛，呈压榨样，伴大汗、气促。昨日加重，持续不缓解收入院。',
    },
    {
      key: 'pastHistory', label: '既往史', section: '既往史',
      source: 'manual', required: true, inputType: 'text',
      default: '高血压病史10余年，规律口服硝苯地平，血压控制稳定。否认糖尿病史，否认重大手术、外伤史，否认药物及食物过敏史。',
      placeholder: '填写既往疾病、手术外伤、过敏等病史',
    },
    {
      key: 'personalHistory', label: '个人史', section: '个人史',
      source: 'manual', required: false, inputType: 'text',
      default: '生于原籍，长期居住本地，否认疫区、疫水接触史，生活习惯待补充。',
      placeholder: '填写居住、职业、生活习惯等个人史',
    },
    {
      key: 'familyHistory', label: '家族史', section: '家族史',
      source: 'manual', required: false, inputType: 'text',
      default: '否认家族遗传病史及类似疾病家族史。',
      placeholder: '填写家族遗传病、类似疾病等情况',
    },
    {
      key: 'examPositive', label: '体格检查阳性发现', section: '体格检查',
      source: 'manual', required: false, inputType: 'text',
      default: '双侧瞳孔等大等圆，直径3.0mm，对光反射灵敏。',
      placeholder: '描述阳性体征',
    },
    {
      key: 'examVitals', label: '生命体征 / 心肺查体', section: '体格检查',
      source: 'lis', required: false, inputType: 'static',
      staticText: '双肺呼吸音清，心率78次/分，律齐。生命体征：T 36.8℃，P 78次/分，BP 134/82mmHg，R 18次/分。',
    },
    {
      key: 'specialExam', label: '专科检查', section: '体格检查',
      source: 'manual', required: false, inputType: 'text',
      default: '心前区无隆起，心界不大，各瓣膜听诊区未闻及明显病理性杂音。',
      placeholder: '补充专科查体',
    },
    {
      key: 'labExam', label: '检验结果', section: '辅助检查',
      source: 'lis', required: false, inputType: 'static',
      staticText: '急诊化验：心肌肌钙蛋白T 1.45ng/ml，明显升高。',
    },
    {
      key: 'imagingExam', label: '影像 / 心电图', section: '辅助检查',
      source: 'pacs', required: false, inputType: 'static',
      staticText: '十二导联心电图示窦性心律，V3-V5导联ST段压低0.15mV，T波倒置，未见病理性Q波。',
    },
    {
      key: 'diagnoses', label: '初步诊断 (ICD-10)', section: '初步诊断',
      source: 'ai', required: true, inputType: 'icd',
    },
    {
      key: 'treatmentPlan', label: '诊疗计划', section: '诊疗计划',
      source: 'ai', required: true, inputType: 'text',
      placeholder: '确认初步诊断后，点击「AI生成诊疗计划」生成，再由医生审核修改',
    },
  ],
};

/** 按 docCode 索引的模板表（后台下发后由此返回） */
export const docTemplates: Record<string, DocTemplate> = {
  DOC001: admissionTemplate,
};
