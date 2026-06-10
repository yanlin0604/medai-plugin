import { describe, expect, it } from 'vitest';
import {
  toDocDefinition,
  toDocFieldDef,
  toDocTemplate,
  toDocVersion,
  toIcdItem,
} from './pluginRuntime';
import type { RuntimeDocFieldDto } from './pluginRuntimeTypes';

const field = (overrides: Partial<RuntimeDocFieldDto>): RuntimeDocFieldDto => ({
  fieldKey: 'treatmentCourse',
  fieldLabel: '诊疗经过',
  sectionName: '诊疗经过',
  fieldOrder: 20,
  sourceType: 'emr',
  inputType: 'text',
  required: true,
  dictatable: false,
  writebackFieldKey: 'emr.treatment_course',
  ...overrides,
});

describe('pluginRuntime adapters', () => {
  it('maps runtime document definitions with local registry metadata', () => {
    const doc = toDocDefinition({
      docCode: 'DOC010',
      docName: '配置化出院记录',
      interactionParadigm: 'summary',
      templateVersion: 'v2',
      pyCode: 'pzcyj',
      iconName: 'ExportOutlined',
      prototypeFile: 'discharge.html',
      workspaceKey: 'discharge',
    });

    expect(doc).toMatchObject({
      code: 'DOC010',
      name: '配置化出院记录',
      workspace: 'discharge',
      paradigm: 'summary',
      group: 'event',
    });
    expect(doc.dataSources).toEqual(['HIS', 'EMR']);
    expect(doc.inputMode).toBe('选项+模板');
  });

  it('sorts template fields and options by backend order', () => {
    const template = toDocTemplate({
      docCode: 'DOC888',
      docName: '出院记录',
      templateVersion: 'v2',
      title: '出院记录',
      fields: [
        field({ fieldKey: 'later', fieldOrder: 30 }),
        field({
          fieldKey: 'diagnosis',
          fieldLabel: '出院诊断',
          sectionName: '出院诊断',
          sourceType: 'icd',
          inputType: 'icd',
          fieldOrder: 10,
          options: [
            { optionValue: 'b', optionLabel: 'B', sortOrder: 2 },
            { optionValue: 'a', optionLabel: 'A', sortOrder: 1 },
          ],
        }),
      ],
    });

    expect(template.fields.map((item) => item.key)).toEqual(['diagnosis', 'later']);
    expect(template.fields[0].options?.map((item) => item.value)).toEqual(['a', 'b']);
  });

  it('maps field, ICD and version DTOs to frontend contracts', () => {
    expect(toDocFieldDef(field({ sourceType: 'icd' })).source).toBe('ai');
    expect(toIcdItem({ diagnosisName: '冠心病', icdCode: 'I25.101', confidence: 0.91 })).toEqual({
      name: '冠心病',
      code: 'I25.101',
      confidence: 91,
    });

    const version = toDocVersion({
      versionNo: 2,
      docCode: 'DOC888',
      patientId: 'ZY001',
      content: '正文',
      fields: { diagnosis: '冠心病' },
      fieldLabels: { diagnosis: '出院诊断' },
      fieldOrder: ['diagnosis'],
      editor: '林志远',
      timestamp: '2026-06-09T12:00:00',
      changeSummary: '提交',
    });

    expect(version.fieldOrder).toEqual(['diagnosis']);
    expect(version.fieldLabels?.diagnosis).toBe('出院诊断');
  });

  it('rejects unknown backend enum values explicitly', () => {
    expect(() => toDocDefinition({
      docCode: 'DOC999',
      docName: '未知文书',
      interactionParadigm: 'unknown',
      templateVersion: 'v1',
    })).toThrow('未知交互范式');

    expect(() => toDocFieldDef(field({ inputType: 'unknown' }))).toThrow('未知字段录入形态');
  });
});
