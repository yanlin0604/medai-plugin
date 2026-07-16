import { describe, expect, it } from 'vitest';
import type { RuntimeFieldCompositionTemplateDto } from '../../services/pluginRuntimeTypes';
import {
  createDefaultCompositionValues,
  formatCompositionFieldValue,
  getCompositionSourceLabel,
  mergeRuntimeCompositionValues,
  parseCompositionFieldValue,
  retainCompositionValuesByItemKey,
} from './compositionFieldState';

const template: RuntimeFieldCompositionTemplateDto = {
  templateId: 1,
  templateName: '常规出院医嘱',
  items: [
    { itemKey: 'activityAdvice', itemLabel: '休息与活动', sourceType: 'fixed', defaultText: '固定活动话术', editable: false, itemOrder: 1, lineTemplate: '{{index}}. {{label}}：{{value}}' },
    { itemKey: 'dietAdvice', itemLabel: '饮食指导', sourceType: 'fixed', defaultText: '固定饮食话术', editable: false, itemOrder: 2, lineTemplate: '{{index}}. {{label}}：{{value}}' },
    { itemKey: 'medicationAdvice', itemLabel: '用药指导', sourceType: 'ai', defaultText: '不应初始化', editable: true, itemOrder: 3, lineTemplate: '{{index}}. {{label}}：{{value}}' },
    { itemKey: 'followupAdvice', itemLabel: '随访复诊', sourceType: 'ai', editable: true, itemOrder: 4, lineTemplate: '{{index}}. {{label}}：{{value}}' },
    { itemKey: 'doctorNote', itemLabel: '医生补充', sourceType: 'manual', defaultText: '不应初始化', editable: true, itemOrder: 5, lineTemplate: '{{index}}. {{label}}：{{value}}' },
  ],
};

describe('compositionFieldState', () => {
  it('仅用 fixed 默认话术初始化组合子项', () => {
    expect(createDefaultCompositionValues(template)).toEqual({
      activityAdvice: '固定活动话术',
      dietAdvice: '固定饮食话术',
      medicationAdvice: '',
      followupAdvice: '',
      doctorNote: '',
    });
  });

  it('按当前行模板完成格式化和精确解析往返', () => {
    const values = {
      ...createDefaultCompositionValues(template),
      medicationAdvice: '按医嘱服药',
      followupAdvice: '一周后复诊',
      doctorNote: '医生手填内容',
    };
    const text = formatCompositionFieldValue(template, values);
    const parsed = parseCompositionFieldValue(template, text);

    expect(parsed.complete).toBe(true);
    expect(parsed.values).toEqual(values);
  });

  it('错误行不按中文标签或位置进行兼容恢复', () => {
    const parsed = parseCompositionFieldValue(template, [
      '1. 休息与活动：固定活动话术',
      '2. 饮食指导：固定饮食话术',
      '随访复诊：不应挪到用药指导',
      '4. 随访复诊：一周后复诊',
      '5. 医生补充：医生手填内容',
    ].join('\n'));

    expect(parsed.complete).toBe(false);
    expect(parsed.values.medicationAdvice).toBe('');
    expect(parsed.values.followupAdvice).toBe('一周后复诊');
    expect(parsed.warnings[0]).toContain('第3行未匹配');
  });

  it('全文运行时只用非空 AI 覆盖，fixed 恢复默认值且 manual 保留本地值', () => {
    const current = {
      activityAdvice: '被误改的固定值',
      dietAdvice: '被误改的固定值',
      medicationAdvice: '原用药内容',
      followupAdvice: '原随访内容',
      doctorNote: '医生本地输入',
    };
    const runtimeText = [
      '1. 休息与活动：模型错误固定值',
      '2. 饮食指导：模型错误固定值',
      '3. 用药指导：新用药内容',
      '4. 随访复诊：',
      '5. 医生补充：模型不应覆盖',
    ].join('\n');

    expect(mergeRuntimeCompositionValues(template, current, runtimeText).values).toEqual({
      activityAdvice: '固定活动话术',
      dietAdvice: '固定饮食话术',
      medicationAdvice: '新用药内容',
      followupAdvice: '原随访内容',
      doctorNote: '医生本地输入',
    });
  });

  it('模板切换只按 itemKey 保留非固定子项', () => {
    const renamedTemplate: RuntimeFieldCompositionTemplateDto = {
      ...template,
      items: template.items.map((item) => item.itemKey === 'medicationAdvice'
        ? { ...item, itemLabel: '出院用药' }
        : item),
    };
    const values = retainCompositionValuesByItemKey(renamedTemplate, {
      activityAdvice: '旧固定值',
      medicationAdvice: '按 key 保留',
      legacyKey: '不能按名称迁移',
    });

    expect(values.activityAdvice).toBe('固定活动话术');
    expect(values.medicationAdvice).toBe('按 key 保留');
    expect(values).not.toHaveProperty('legacyKey');
  });

  it('使用面向医生的来源标签', () => {
    expect(getCompositionSourceLabel(template.items[0])).toBe('模板固定');
    expect(getCompositionSourceLabel(template.items[2])).toBe('助手生成');
    expect(getCompositionSourceLabel(template.items[4])).toBe('手工填写');
  });
});
