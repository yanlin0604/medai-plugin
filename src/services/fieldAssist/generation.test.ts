import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeFieldCompletionResponse } from '../pluginRuntimeTypes';
import type { FieldAssistContext } from './types';

const { completeFieldMock, getFieldCompositionMock } = vi.hoisted(() => ({
  completeFieldMock: vi.fn(),
  getFieldCompositionMock: vi.fn(),
}));

vi.mock('../pluginRuntime', () => ({
  pluginRuntimeApi: {
    completeField: completeFieldMock,
    getFieldComposition: getFieldCompositionMock,
  },
}));

import {
  COMPOSITION_FIXED_GENERATION_MESSAGE,
  COMPOSITION_MANUAL_GENERATION_MESSAGE,
  FIELD_GENERATION_UNAVAILABLE_MESSAGE,
  generateFieldDraft,
} from './generation';

function createContext(overrides: Partial<FieldAssistContext> = {}): FieldAssistContext {
  return {
    source: 'demo-cs',
    patientId: 'P001',
    patientName: '张三',
    docCode: 'DOC010',
    docName: '出院记录',
    fieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
    fieldLabel: '出院医嘱',
    assistantEnabled: true,
    fieldValue: '当前组合字段正文',
    selectedText: '',
    prefix: '',
    selectionStart: 0,
    selectionEnd: 0,
    trigger: 'focus',
    sessionId: 'session-1',
    writebackUrl: 'http://127.0.0.1:5175/api/field-writeback',
    detectedAt: '2026-07-16T00:00:00.000Z',
    receivedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function createResponse(context: FieldAssistContext): RuntimeFieldCompletionResponse {
  return {
    generationId: 'gen-1',
    patientId: context.patientId,
    visitId: context.patientId,
    documentType: context.docName,
    docCode: context.docCode,
    fieldKey: context.fieldKey,
    parentFieldKey: context.parentFieldKey,
    compositionItemKey: context.compositionItemKey,
    compositionItemLabel: context.compositionItemLabel,
    generatedText: '生成结果',
    usedEvidenceIds: [],
    evidenceSummary: [],
    warnings: [],
  };
}

describe('fieldAssist generation capability', () => {
  beforeEach(() => {
    completeFieldMock.mockReset();
    getFieldCompositionMock.mockReset();
  });

  it('非助手字段返回业务提示且不请求字段生成接口', async () => {
    const context = createContext({
      assistantEnabled: false,
      assistantDisabledReason: FIELD_GENERATION_UNAVAILABLE_MESSAGE,
    });
    await expect(generateFieldDraft(context)).rejects.toThrow(FIELD_GENERATION_UNAVAILABLE_MESSAGE);
    expect(completeFieldMock).not.toHaveBeenCalled();
  });

  it.each([
    ['fixed', COMPOSITION_FIXED_GENERATION_MESSAGE],
    ['manual', COMPOSITION_MANUAL_GENERATION_MESSAGE],
  ] as const)('%s 组合子项在请求前返回能力提示', async (compositionSourceType, message) => {
    const context = createContext({
      compositionItemKey: `${compositionSourceType}Item`,
      compositionSourceType,
    });
    await expect(generateFieldDraft(context)).rejects.toThrow(message);
    expect(completeFieldMock).not.toHaveBeenCalled();
  });

  it('AI 组合子项携带患者、文书、原生父字段、模板和 itemKey', async () => {
    const context = createContext({
      parentFieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
      compositionItemKey: 'medicationAdvice',
      compositionItemLabel: '用药指导',
      compositionSourceType: 'ai',
      compositionTemplateId: 101,
      fieldValue: '原用药内容',
    });
    completeFieldMock.mockResolvedValue(createResponse(context));

    await generateFieldDraft(context);

    expect(completeFieldMock).toHaveBeenCalledWith(expect.objectContaining({
      patientId: 'P001',
      docCode: 'DOC010',
      fieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
      parentFieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
      compositionTemplateId: 101,
      compositionItemKey: 'medicationAdvice',
      currentText: '原用药内容',
    }));
  });


  it('缺少组合模板 ID 时查询选中模板，校验 itemKey/sourceType 后再生成', async () => {
    const context = createContext({
      parentFieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
      compositionItemKey: 'followupAdvice',
      compositionItemLabel: '随访复诊',
      compositionSourceType: 'ai',
    });
    getFieldCompositionMock.mockResolvedValue({
      docCode: 'DOC010',
      parentFieldKey: context.parentFieldKey,
      selectedTemplateId: 202,
      templates: [{
        templateId: 202,
        templateName: '常规出院医嘱',
        items: [
          { itemKey: 'followupAdvice', itemLabel: '随访复诊', sourceType: 'ai' },
        ],
      }],
    });
    completeFieldMock.mockResolvedValue(createResponse(context));

    await generateFieldDraft(context);

    expect(getFieldCompositionMock).toHaveBeenCalledWith('DOC010', context.parentFieldKey, expect.any(Object));
    expect(completeFieldMock).toHaveBeenCalledWith(expect.objectContaining({ compositionTemplateId: 202 }));
  });

  it('组合模板查询失败或 item 不是 AI 时显示能力提示且不生成', async () => {
    const context = createContext({
      parentFieldKey: 'hm:DE06.00.287.00.005:c3df523fd52dad5bdb8fb4c0d4c68bac',
      compositionItemKey: 'medicationAdvice',
      compositionSourceType: 'ai',
    });
    getFieldCompositionMock.mockResolvedValue({
      docCode: 'DOC010',
      parentFieldKey: context.parentFieldKey,
      selectedTemplateId: 303,
      templates: [{
        templateId: 303,
        templateName: '不支持的模板',
        items: [{ itemKey: 'medicationAdvice', itemLabel: '用药指导', sourceType: 'manual' }],
      }],
    });

    await expect(generateFieldDraft(context)).rejects.toThrow('当前组合字段模板不可用');
    expect(completeFieldMock).not.toHaveBeenCalled();
  });

  it('整父字段生成携带当前正文作为 currentText', async () => {
    const context = createContext({ fieldValue: '当前完整出院医嘱' });
    completeFieldMock.mockResolvedValue(createResponse(context));

    await generateFieldDraft(context);

    expect(completeFieldMock).toHaveBeenCalledWith(expect.objectContaining({
      fieldKey: context.fieldKey,
      currentText: '当前完整出院医嘱',
    }));
  });
});
