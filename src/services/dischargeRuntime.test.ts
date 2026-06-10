import { describe, expect, it } from 'vitest';
import {
  applyDischargeFieldAutomation,
  buildDischargeRuntime,
  calculateHospitalDays,
  isDischargeMetaSection,
} from './dischargeRuntime';
import type {
  RuntimeDocFieldDto,
  RuntimeDocTemplateDto,
  RuntimeDocValueBundleDto,
} from './pluginRuntimeTypes';
import type { PatientBrief } from './types';

const patient: PatientBrief = {
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bed: '1201',
  admissionNo: 'ZY001',
  diagnosis: '冠心病',
};

const field = (overrides: Partial<RuntimeDocFieldDto>): RuntimeDocFieldDto => ({
  fieldKey: 'admissionDate',
  fieldLabel: '入院日期',
  sectionName: '入院日期',
  fieldOrder: 10,
  sourceType: 'his',
  inputType: 'static',
  required: true,
  dictatable: false,
  writebackFieldKey: 'bs.admission_date',
  renderRule: { metaSlot: 'date', editable: false, readOnlyHint: 'HIS同步' },
  ...overrides,
});

const template = (fields: RuntimeDocFieldDto[]): RuntimeDocTemplateDto => ({
  docCode: 'DOC888',
  docName: '出院记录',
  templateVersion: 'v2',
  title: '出院记录',
  fields,
});

const values = (overrides?: Partial<RuntimeDocValueBundleDto>): RuntimeDocValueBundleDto => ({
  docCode: 'DOC888',
  patientIdHis: 'ZY001',
  values: {
    admissionDate: { fieldKey: 'admissionDate', value: '2026-06-01', sourceType: 'his' },
    treatmentCourse: { fieldKey: 'treatmentCourse', value: '住院期间完善相关检查。', sourceType: 'emr' },
  },
  icdCandidates: [
    { diagnosisName: '冠状动脉粥样硬化性心脏病', icdCode: 'I25.101', confidence: 0.96 },
  ],
  pulledSources: [],
  ...overrides,
});

describe('dischargeRuntime', () => {
  it('builds sections, meta rows, read-only hints and writeback keys from backend config', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'treatmentCourse',
          fieldLabel: '诊疗经过',
          sectionName: '诊疗经过',
          fieldOrder: 20,
          sourceType: 'emr',
          inputType: 'text',
          writebackFieldKey: 'bs.treatment_course',
          renderRule: { metaSlot: 'body', editable: true },
        }),
        field({ fieldOrder: 10 }),
      ]),
      values(),
      patient,
    );

    expect(runtime.sections.map((section) => section.key)).toEqual(['admissionDate', 'treatmentCourse']);
    expect(runtime.sections[1]).toMatchObject({
      title: '诊疗经过',
      text: '住院期间完善相关检查。',
      fieldKey: 'bs.treatment_course',
      editable: true,
    });
    expect(runtime.metaFieldKeys).toEqual(['admissionDate']);
    expect(isDischargeMetaSection(runtime.sections[0], runtime.metaFieldKeys)).toBe(true);
    expect(runtime.sections[0]).toMatchObject({ inputType: 'date', editable: true });
    expect(runtime.metaRows[2][0]).toEqual({ label: '入院日期', value: '2026-06-01' });
    expect(runtime.readOnlyHints.admissionDate).toBe('HIS同步');
    expect(runtime.icdCandidates[0]).toMatchObject({ code: 'I25.101', confidence: 96 });
  });

  it('blocks missing or inconsistent backend template configuration', () => {
    expect(() => buildDischargeRuntime(template([]), values(), patient)).toThrow('后台出院记录模板未配置字段');
    expect(() => buildDischargeRuntime(template([field({})]), values({ docCode: 'DOC999' }), patient))
      .toThrow('文书编码不一致');
    expect(() => buildDischargeRuntime(template([
      field({ fieldKey: 'dup', writebackFieldKey: 'same' }),
      field({ fieldKey: 'dup', fieldOrder: 20, writebackFieldKey: 'other' }),
    ]), values(), patient)).toThrow('字段键重复');
    expect(() => buildDischargeRuntime(template([
      field({ fieldKey: 'a', writebackFieldKey: 'same' }),
      field({ fieldKey: 'b', fieldOrder: 20, writebackFieldKey: 'same' }),
    ]), values(), patient)).toThrow('回写字段键重复');
  });

  it('calculates hospital days from configurable date fields', () => {
    expect(calculateHospitalDays('2026-06-01', '2026-06-10')).toBe(9);
    expect(calculateHospitalDays('2026-06-01', '2026-06-01')).toBe(1);
    expect(calculateHospitalDays('2026-06-10', '2026-06-01')).toBeNull();

    const sections = applyDischargeFieldAutomation([
      {
        key: 'admissionDate',
        title: '入院日期',
        text: '2026-06-01',
        fieldKey: 'admissionDate',
        editable: true,
        inputType: 'date',
      },
      {
        key: 'dischargeDate',
        title: '出院日期',
        text: '2026-06-10',
        fieldKey: 'dischargeDate',
        editable: true,
        inputType: 'date',
      },
      {
        key: 'hospitalDays',
        title: '住院天数',
        text: '',
        fieldKey: 'hospitalDays',
        editable: false,
        inputType: 'static',
        calculation: undefined,
      },
    ]);

    expect(sections.find((section) => section.key === 'hospitalDays')?.text).toBe('9天');
  });
});
