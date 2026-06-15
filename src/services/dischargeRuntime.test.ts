import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPluginRuntimeApi } = vi.hoisted(() => ({
  mockPluginRuntimeApi: {
    getRuntimeTemplate: vi.fn(),
    resolveRuntimeValues: vi.fn(),
    resolveRuntimeFieldValue: vi.fn(),
  },
}));

vi.mock('./pluginRuntime', () => ({
  pluginRuntimeApi: mockPluginRuntimeApi,
  toIcdItem: (candidate: {
    diagnosisName: string;
    icdCode?: string;
    confidence?: number;
    matched?: boolean;
    matchSource?: string;
    matchReason?: string;
  }) => ({
    name: candidate.diagnosisName,
    code: candidate.icdCode,
    confidence: Math.round((candidate.confidence ?? 0) * 100),
    ...(candidate.matched === undefined ? {} : { matched: candidate.matched }),
    ...(candidate.matchSource ? { matchSource: candidate.matchSource } : {}),
    ...(candidate.matchReason ? { matchReason: candidate.matchReason } : {}),
  }),
}));

import {
  applyDischargeFieldAutomation,
  buildDischargeRuntime,
  buildDischargeRuntimeField,
  calculateHospitalDays,
  clearDischargeRuntimeCache,
  isDischargeMetaSection,
  loadDischargeRuntime,
  loadDischargeRuntimeField,
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
  beforeEach(() => {
    mockPluginRuntimeApi.getRuntimeTemplate.mockReset();
    mockPluginRuntimeApi.resolveRuntimeValues.mockReset();
    mockPluginRuntimeApi.resolveRuntimeFieldValue.mockReset();
    clearDischargeRuntimeCache();
  });

  it('caches runtime loading per document and patient until explicitly cleared', async () => {
    mockPluginRuntimeApi.getRuntimeTemplate.mockResolvedValue(template([field({})]));
    mockPluginRuntimeApi.resolveRuntimeValues.mockResolvedValue(values());

    const [first, second] = await Promise.all([
      loadDischargeRuntime('DOC888', 'ZY001', patient),
      loadDischargeRuntime('DOC888', 'ZY001', patient),
    ]);
    const third = await loadDischargeRuntime('DOC888', 'ZY001', patient);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mockPluginRuntimeApi.getRuntimeTemplate).toHaveBeenCalledTimes(1);
    expect(mockPluginRuntimeApi.resolveRuntimeValues).toHaveBeenCalledTimes(1);

    clearDischargeRuntimeCache('DOC888', 'ZY001');
    await loadDischargeRuntime('DOC888', 'ZY001', patient);

    expect(mockPluginRuntimeApi.getRuntimeTemplate).toHaveBeenCalledTimes(2);
    expect(mockPluginRuntimeApi.resolveRuntimeValues).toHaveBeenCalledTimes(2);
  });

  it('force refresh bypasses the runtime cache for the same document and patient', async () => {
    mockPluginRuntimeApi.getRuntimeTemplate.mockResolvedValue(template([field({})]));
    mockPluginRuntimeApi.resolveRuntimeValues.mockResolvedValue(values());

    await loadDischargeRuntime('DOC888', 'ZY001', patient);
    await loadDischargeRuntime('DOC888', 'ZY001', patient, { forceRefresh: true });

    expect(mockPluginRuntimeApi.getRuntimeTemplate).toHaveBeenCalledTimes(2);
    expect(mockPluginRuntimeApi.resolveRuntimeValues).toHaveBeenCalledTimes(2);
  });

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

  it('maps generation warnings and ICD match metadata without changing field text', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'treatmentCourse',
          fieldLabel: '诊疗经过',
          sectionName: '诊疗经过',
          fieldOrder: 20,
          sourceType: 'ai',
          inputType: 'text',
          writebackFieldKey: 'bs.treatment_course',
          renderRule: { metaSlot: 'body', editable: true },
        }),
      ]),
      values({
        values: {
          treatmentCourse: {
            fieldKey: 'treatmentCourse',
            value: '住院期间完善相关检查。',
            sourceType: 'ai',
            strategyType: 'hybrid',
            usedEvidenceIds: ['ev001'], // 添加证据ID
            warnings: ['可用证据不足，字段生成结果需人工复核'],
            sourceStatuses: [
              { sourceSystem: 'PACS', status: 'failed', message: 'PACS连接超时' },
            ],
          },
        },
        icdCandidates: [
          {
            diagnosisName: '急性非ST段抬高型心肌梗死',
            icdCode: 'I21.401',
            confidence: 0.91,
            matched: true,
            matchSource: 'alias',
            matchReason: '按诊断别名匹配',
          },
        ],
      }),
      patient,
    );

    expect(runtime.sections[0].text).toBe('住院期间完善相关检查。');
    expect(runtime.readOnlyHints.treatmentCourse).toContain('可用证据不足');
    expect(runtime.readOnlyHints.treatmentCourse).toContain('PACS: PACS连接超时');
    expect(runtime.icdCandidates[0]).toMatchObject({
      code: 'I21.401',
      matched: true,
      matchSource: 'alias',
      matchReason: '按诊断别名匹配',
    });
  });

  it('loads and maps one runtime field without resolving the whole document again', async () => {
    const runtimeTemplate = template([
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
    ]);
    mockPluginRuntimeApi.resolveRuntimeFieldValue.mockResolvedValue(values({
      values: {
        treatmentCourse: {
          fieldKey: 'treatmentCourse',
          value: '单字段重新生成内容。',
          sourceType: 'emr',
          warnings: ['单字段证据不足'],
        },
      },
    }));

    const fieldState = await loadDischargeRuntimeField('DOC888', 'ZY001', 'treatmentCourse', runtimeTemplate);

    expect(fieldState.section).toMatchObject({
      key: 'treatmentCourse',
      title: '诊疗经过',
      text: '单字段重新生成内容。',
    });
    expect(fieldState.readOnlyHint).toBe('单字段证据不足');
    expect(mockPluginRuntimeApi.resolveRuntimeFieldValue).toHaveBeenCalledWith('DOC888', 'ZY001', 'treatmentCourse');
    expect(mockPluginRuntimeApi.resolveRuntimeValues).not.toHaveBeenCalled();
  });

  it('maps a single runtime field from an already loaded value bundle', () => {
    const fieldState = buildDischargeRuntimeField(
      template([
        field({
          fieldKey: 'admissionDate',
          fieldLabel: '入院日期',
          sectionName: '入院日期',
          sourceType: 'his',
        }),
      ]),
      values({
        values: {
          admissionDate: { fieldKey: 'admissionDate', value: '2026-06-08', sourceType: 'his' },
        },
      }),
      'admissionDate',
    );

    expect(fieldState.section.text).toBe('2026-06-08');
  });

  it('returns empty text when AI recognition fails with errorMessage instead of using default value', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'treatmentCourse',
          fieldLabel: '诊疗经过',
          sectionName: '诊疗经过',
          fieldOrder: 20,
          sourceType: 'ai',
          inputType: 'text',
          staticText: '待AI生成',
          defaultValue: '无特殊诊疗',
          writebackFieldKey: 'bs.treatment_course',
          renderRule: { metaSlot: 'body', editable: true },
        }),
      ]),
      values({
        values: {
          treatmentCourse: {
            fieldKey: 'treatmentCourse',
            value: null,
            sourceType: 'ai',
            errorMessage: 'AI生成失败：证据数据源不可用',
          },
        },
      }),
      patient,
    );

    expect(runtime.sections[0].text).toBe('');
    expect(runtime.readOnlyHints.treatmentCourse).toBe('AI生成失败：证据数据源不可用');
  });

  it('returns empty text when AI generates fallback content after failure', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'admissionCondition',
          fieldLabel: '入院情况',
          sectionName: '入院情况',
          fieldOrder: 20,
          sourceType: 'ai',
          inputType: 'text',
          writebackFieldKey: 'bs.admission_condition',
          renderRule: { metaSlot: 'body', editable: true },
        }),
      ]),
      values({
        values: {
          admissionCondition: {
            fieldKey: 'admissionCondition',
            value: '2026-06-01 静脉血：白细胞计数(WBC):9.9×9^9/L，红细胞计数(RBC):9.9×9^12/L',
            sourceType: 'ai',
            errorMessage: 'AI字段生成失败',
            usedEvidenceIds: ['LIS-001', 'PACS-002'],
            warnings: ['AI字段生成失败，已使用兜底内容'],
          },
        },
      }),
      patient,
    );

    // 即使有兜底内容，因为errorMessage存在，也应该返回空
    expect(runtime.sections[0].text).toBe('');
  });

  it('returns empty text when AI generates content without evidence support', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'treatmentCourse',
          fieldLabel: '诊疗经过',
          sectionName: '诊疗经过',
          fieldOrder: 20,
          sourceType: 'ai',
          inputType: 'text',
          writebackFieldKey: 'bs.treatment_course',
          renderRule: { metaSlot: 'body', editable: true },
        }),
      ]),
      values({
        values: {
          treatmentCourse: {
            fieldKey: 'treatmentCourse',
            value: '患者入院后给予常规治疗。',
            sourceType: 'ai',
            usedEvidenceIds: [], // 没有证据支撑，AI胡编的
          },
        },
      }),
      patient,
    );

    expect(runtime.sections[0].text).toBe('患者入院后给予常规治疗。');
  });

  it('keeps AI generated content when it has evidence support', () => {
    const runtime = buildDischargeRuntime(
      template([
        field({
          fieldKey: 'treatmentCourse',
          fieldLabel: '诊疗经过',
          sectionName: '诊疗经过',
          fieldOrder: 20,
          sourceType: 'ai',
          inputType: 'text',
          writebackFieldKey: 'bs.treatment_course',
          renderRule: { metaSlot: 'body', editable: true },
        }),
      ]),
      values({
        values: {
          treatmentCourse: {
            fieldKey: 'treatmentCourse',
            value: '患者入院后完善冠脉造影检查。',
            sourceType: 'ai',
            usedEvidenceIds: ['ev001', 'ev002'], // 有证据支撑
          },
        },
      }),
      patient,
    );

    expect(runtime.sections[0].text).toBe('患者入院后完善冠脉造影检查。');
  });
});
