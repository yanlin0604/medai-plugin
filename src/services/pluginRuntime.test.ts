import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pluginRuntimeApi,
  toDocDefinition,
  toDocFieldDef,
  toDocTemplate,
  toDocVersion,
  toIcdItem,
} from './pluginRuntime';
import type {
  RuntimeApiResponse,
  RuntimeDocFieldDto,
  RuntimeEvidenceBundleDto,
  RuntimeFieldCompletionResponse,
  RuntimeWritebackAuditResponse,
} from './pluginRuntimeTypes';

const { mockHttp } = vi.hoisted(() => ({
  mockHttp: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockHttp),
    isAxiosError: vi.fn(() => false),
  },
}));

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

const ok = <T,>(data: T): Promise<{ data: RuntimeApiResponse<T> }> => Promise.resolve({
  data: {
    code: 200,
    msg: 'ok',
    data,
  },
});

describe('pluginRuntime adapters', () => {
  beforeEach(() => {
    mockHttp.get.mockReset();
    mockHttp.post.mockReset();
    mockHttp.put.mockReset();
  });

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

  it('calls evidence query endpoint with patient, visit, document and field context', async () => {
    const bundle: RuntimeEvidenceBundleDto = {
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
      evidenceItems: [],
      sourceStatuses: [],
      warnings: [],
    };
    const request = {
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
    };
    mockHttp.get.mockReturnValueOnce(ok(bundle));

    await expect(pluginRuntimeApi.getEvidence(request)).resolves.toEqual(bundle);

    expect(mockHttp.get).toHaveBeenCalledWith('/medical/pluginRuntime/evidence', { params: request });
  });

  it('posts field completion and writeback audit payloads through runtime API', async () => {
    const completion: RuntimeFieldCompletionResponse = {
      generationId: 'FCR-1',
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
      generatedText: '住院期间完善检查。',
      usedEvidenceIds: ['lis-1'],
      evidenceSummary: [],
      warnings: [],
      recommendedWritebackMode: 'append',
    };
    const audit: RuntimeWritebackAuditResponse = {
      generationId: 'FCR-1',
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
      audited: true,
      completionStatus: 'written_back',
    };
    const completionRequest = {
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
      currentText: '原诊疗经过',
      selectedEvidenceIds: ['lis-1'],
      mode: 'append' as const,
    };
    const auditRequest = {
      patientId: 'ZY001',
      visitId: 'ZY001',
      documentType: '出院记录',
      docCode: 'DOC010',
      fieldKey: 'treatmentCourse',
      writebackMode: 'append' as const,
      finalText: '原诊疗经过\n住院期间完善检查。',
    };
    mockHttp.post
      .mockReturnValueOnce(ok(completion))
      .mockReturnValueOnce(ok(audit));

    await expect(pluginRuntimeApi.completeField(completionRequest)).resolves.toEqual(completion);
    await expect(pluginRuntimeApi.auditFieldWriteback('FCR-1', auditRequest)).resolves.toEqual(audit);

    expect(mockHttp.post).toHaveBeenNthCalledWith(1, '/medical/pluginRuntime/field-completions', completionRequest);
    expect(mockHttp.post).toHaveBeenNthCalledWith(
      2,
      '/medical/pluginRuntime/field-completions/FCR-1/writeback-audit',
      auditRequest,
    );
  });
});
