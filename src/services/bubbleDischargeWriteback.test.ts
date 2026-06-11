import { describe, expect, it, vi } from 'vitest';
import { buildBubbleDischargeDraft, submitBubbleDischargeDraft } from './bubbleDischargeWriteback';
import type { DischargeRuntimeState } from './dischargeRuntime';
import type { ClinicalSection, DocDraft, Patient } from './types';
import type { DocumentVersionAdapter, VersionSnapshotInput } from './versionService';

const patient: Patient = {
  id: 'ZY20260001',
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bedNo: '1201',
  deptName: '心血管内科',
  admissionDate: '2026-06-01',
  admissionDays: 4,
  doctor: '林志远',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

const sections: ClinicalSection[] = [
  {
    key: 'admissionDate',
    title: '入院日期',
    fieldKey: 'admissionDate',
    text: '2026-06-01',
    editable: true,
    source: 'his',
  },
  {
    key: 'admissionCondition',
    title: '入院情况',
    fieldKey: 'admissionCondition',
    text: '患者因胸痛入院。',
    editable: true,
    source: 'emr',
  },
];

function runtime(overrides?: Partial<DischargeRuntimeState>): DischargeRuntimeState {
  return {
    template: {} as DischargeRuntimeState['template'],
    values: {} as DischargeRuntimeState['values'],
    sections,
    metaRows: [],
    metaFieldKeys: [],
    readOnlyHints: {},
    icdCandidates: [],
    ...overrides,
  };
}

describe('bubbleDischargeWriteback', () => {
  it('builds writeback payload and draft values from the same runtime sections', async () => {
    const draft = await buildBubbleDischargeDraft(patient, '出院记录', {
      loadRuntime: async () => runtime(),
    });

    expect(draft.payload.fields).toMatchObject({
      patientInfo: expect.stringContaining('姓名：陈建国'),
      admissionDate: '2026-06-01',
      admissionCondition: '患者因胸痛入院。',
      physicianSignature: '林志远',
    });
    expect(draft.payload.fieldLabels).toMatchObject({
      admissionCondition: '入院情况',
      physicianSignature: '医师签名',
    });
    expect(draft.payload.fieldOrder).toEqual([
      'patientInfo',
      'admissionDate',
      'admissionCondition',
      'physicianSignature',
    ]);
    expect(draft.payload.content).toBe('【入院日期】2026-06-01\n【入院情况】患者因胸痛入院。');
    expect(draft.draftValues.admissionCondition).toBe(draft.payload.fields.admissionCondition);
  });

  it('fails clearly when runtime field generation fails', async () => {
    await expect(buildBubbleDischargeDraft(patient, '出院记录', {
      loadRuntime: async () => {
        throw new Error('runtime unavailable');
      },
    })).rejects.toThrow('字段生成失败，点开处理：runtime unavailable');
  });

  it('passes force refresh to runtime loading when rebuilding a bubble draft', async () => {
    const loadRuntime = vi.fn(async () => runtime());

    await buildBubbleDischargeDraft(patient, '出院记录', {
      loadRuntime,
      forceRefresh: true,
    });

    expect(loadRuntime).toHaveBeenCalledWith(
      'DOC010',
      patient.id,
      expect.objectContaining({ admissionNo: patient.id }),
      { forceRefresh: true },
    );
  });

  it('does not write back or persist draft when runtime field generation fails', async () => {
    const savedDrafts: DocDraft[] = [];
    const createdVersions: VersionSnapshotInput[] = [];
    const writeback = vi.fn(async () => ({ ok: true, message: '写入完成' }));
    const versionAdapter: DocumentVersionAdapter = {
      listVersions: async () => [],
      createVersion: async (snapshot) => {
        createdVersions.push(snapshot);
        return { ...snapshot, versionNo: 1 };
      },
    };

    await expect(submitBubbleDischargeDraft(patient, '出院记录', '林志远 主治医师', {
      loadRuntime: async () => {
        throw new Error('runtime unavailable');
      },
      writeback,
      versionAdapter,
      save: (draft) => savedDrafts.push(draft),
    })).rejects.toThrow('字段生成失败，点开处理：runtime unavailable');

    expect(writeback).not.toHaveBeenCalled();
    expect(savedDrafts).toHaveLength(0);
    expect(createdVersions).toHaveLength(0);
  });

  it('persists a submitted draft and creates a version after successful bubble writeback', async () => {
    const savedDrafts: DocDraft[] = [];
    const createdVersions: VersionSnapshotInput[] = [];
    const writeback = vi.fn(async () => ({ ok: true, message: '写入完成' }));
    const versionAdapter: DocumentVersionAdapter = {
      listVersions: async () => [],
      createVersion: async (snapshot) => {
        createdVersions.push(snapshot);
        return { ...snapshot, versionNo: 1 };
      },
    };

    const result = await submitBubbleDischargeDraft(patient, '出院记录', '林志远 主治医师', {
      loadRuntime: async () => runtime(),
      writeback,
      versionAdapter,
      save: (draft) => savedDrafts.push(draft),
      now: () => '2026-06-11T00:00:00.000Z',
    });

    expect(result).toMatchObject({ ok: true, written: true, historyCreated: true });
    expect(writeback).toHaveBeenCalledWith(expect.objectContaining({
      docCode: 'DOC010',
      patientId: patient.id,
      fields: expect.objectContaining({ admissionCondition: '患者因胸痛入院。' }),
    }));
    expect(savedDrafts[0]).toMatchObject({
      docCode: 'DOC010',
      patientId: patient.id,
      status: 'submitted',
      values: expect.objectContaining({ admissionCondition: '患者因胸痛入院。' }),
      content: '【入院日期】2026-06-01\n【入院情况】患者因胸痛入院。',
    });
    expect(createdVersions[0]).toMatchObject({
      docCode: 'DOC010',
      patientId: patient.id,
      editor: '林志远 主治医师',
      changeSummary: '助手气泡回写出院记录',
      fields: expect.objectContaining({ admissionCondition: '患者因胸痛入院。' }),
    });
  });

  it('reuses a prepared bubble draft without loading runtime again', async () => {
    const preparedDraft = await buildBubbleDischargeDraft(patient, '出院记录', {
      loadRuntime: async () => runtime(),
    });
    const loadRuntime = vi.fn(async () => {
      throw new Error('should not load runtime again');
    });
    const writeback = vi.fn(async () => ({ ok: true, message: '写入完成' }));

    const result = await submitBubbleDischargeDraft(patient, '出院记录', '林志远 主治医师', {
      preparedDraft,
      loadRuntime,
      writeback,
      versionAdapter: {
        listVersions: async () => [],
        createVersion: async (snapshot) => ({ ...snapshot, versionNo: 1 }),
      },
      save: () => undefined,
      now: () => '2026-06-11T00:00:00.000Z',
    });

    expect(result).toMatchObject({ ok: true, written: true, historyCreated: true });
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(writeback).toHaveBeenCalledWith(preparedDraft.payload);
  });
});
