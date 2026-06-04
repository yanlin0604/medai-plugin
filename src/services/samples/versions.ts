// 入院记录（DOC001）历史版本样例数据。
//
// ⚠️ 接口层「样例实现」：模拟此前已提交的版本快照，供版本历史/对比在后端就绪前跑通。
// TODO: 后端就绪后由 versionService 真实接口替代。

import type { DocVersion } from '../types';

const toContent = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `【${k}】${v}`)
    .join('\n');

/** v1：首次成稿（要素粗略） */
const v1Fields: Record<string, string> = {
  主诉: '间断性心前区疼痛3天。',
  现病史: '患者3天前出现心前区疼痛，性质未详述，自行观察未就诊。',
  既往史: '高血压病史，具体用药不详。',
  个人史: '吸烟史多年。无特殊饮酒嗜好。',
  体格检查: '双侧瞳孔等大等圆。双肺呼吸音清，心率78次/分，律齐。',
  初步诊断: '1. 冠状动脉粥样硬化性心脏病 [I25.101]',
};

/** v2：修订完善 */
const v2Fields: Record<string, string> = {
  主诉: '间断性心前区疼痛3天，加重伴大汗、气促1天。',
  现病史: '患者于3天前无明显诱因出现心前区疼痛，呈压榨样，伴大汗、气促。昨日加重，持续不缓解收入院。',
  既往史: '高血压病史10余年，规律口服硝苯地平，血压控制稳定。',
  个人史: '吸烟史30余年，每日一包(约20支)。无特殊饮酒嗜好。',
  体格检查:
    '双侧瞳孔等大等圆，直径3.0mm，对光反射灵敏。双肺呼吸音清，心率78次/分，律齐。生命体征：T 36.8℃，P 78次/分，BP 134/82mmHg，R 18次/分。',
  初步诊断: '1. 冠状动脉粥样硬化性心脏病 [I25.101]；2. 急性非ST段抬高型心肌梗死 [I21.401]',
};

export const admissionVersions: DocVersion[] = [
  {
    versionNo: 1, docCode: 'DOC001', patientId: '10082',
    fields: v1Fields, content: toContent(v1Fields),
    editor: '李明 主治医师', timestamp: '2026-06-03T09:12:00',
    changeSummary: '首次成稿提交（要素待完善）',
  },
  {
    versionNo: 2, docCode: 'DOC001', patientId: '10082',
    fields: v2Fields, content: toContent(v2Fields),
    editor: '李明 主治医师', timestamp: '2026-06-03T15:40:00',
    changeSummary: '补充主诉加重情况、既往用药细节与体格检查，新增心梗诊断',
  },
];
