import { describe, expect, it, vi } from 'vitest';

vi.mock('./pluginRuntime', () => ({
  pluginRuntimeApi: {},
  toIcdItem: vi.fn(),
}));

import { buildAdmissionRuntime } from './admissionRuntime';
import type { RuntimeDocFieldDto, RuntimeDocTemplateDto, RuntimeDocValueBundleDto } from './pluginRuntimeTypes';
import type { PatientBrief } from './types';

const patient: PatientBrief = {
  name: '陈建国', gender: '男', age: '65岁', bed: '1201', admissionNo: 'ZY001', diagnosis: '冠心病',
};

const field: RuntimeDocFieldDto = {
  fieldKey: 'chiefComplaint',
  fieldLabel: '主诉',
  sectionName: '入院记录',
  fieldOrder: 10,
  sourceType: 'emr',
  inputType: 'text',
  required: true,
  dictatable: true,
  writebackFieldKey: 'bs.chief_complaint',
  renderRule: {},
};

const template: RuntimeDocTemplateDto = {
  docCode: 'DOC001', docName: '入院记录', templateVersion: 'v2', title: '入院记录', fields: [field],
};

const values: RuntimeDocValueBundleDto = {
  docCode: 'DOC001',
  patientIdHis: 'ZY001',
  values: {
    chiefComplaint: { fieldKey: 'chiefComplaint', value: '反复胸闷3天。', sourceType: 'emr' },
  },
  icdCandidates: [],
  pulledSources: [],
};

describe('admissionRuntime', () => {
  it('字段卡片标题优先使用字段名称而不是文书分组名称', () => {
    const runtime = buildAdmissionRuntime(template, values, patient);

    expect(runtime.sections[0]).toMatchObject({
      title: '主诉',
      text: '反复胸闷3天。',
      fieldKey: 'bs.chief_complaint',
    });
  });
});
