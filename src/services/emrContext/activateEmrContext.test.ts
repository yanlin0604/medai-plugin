import { describe, expect, it, vi } from 'vitest';
import { activateEmrContext } from './activateEmrContext';
import type { EmrContext } from './types';

const baseContext: EmrContext = {
  source: 'demo-cs',
  patientId: 'P001',
  patientIdHis: 'ZY001',
  patientName: '张三',
  gender: '男',
  age: '62岁',
  bedNo: '1201',
  deptName: '心内科',
  admissionDate: '2026-06-08',
  admissionDays: 1,
  doctor: '李医生',
  diagnosis: '冠心病',
  docCode: 'DOC003',
  docName: '上级医师查房记录',
  confidence: 0.98,
  signals: ['document-title'],
  detectedAt: '2026-06-08T08:30:00.000Z',
  receivedAt: '2026-06-08T08:30:00.000Z',
};

describe('activateEmrContext', () => {
  it.each(['DOC004', 'DOC017'] as const)('activates %s from CS context without filtering it out', (docCode) => {
    const selectPatient = vi.fn();
    const selectDoc = vi.fn();

    const activation = activateEmrContext({ ...baseContext, docCode, docName: docCode === 'DOC004' ? '主治医生查房记录' : '主治医生首次查房记录' }, selectPatient, selectDoc);

    expect(activation?.docCode).toBe(docCode);
    expect(selectDoc).toHaveBeenCalledWith(expect.objectContaining({ code: docCode }));
  });

  it('keeps the EMR reported document name for registered document codes', () => {
    const selectPatient = vi.fn();
    const selectDoc = vi.fn();

    const activation = activateEmrContext(baseContext, selectPatient, selectDoc);

    expect(activation?.docCode).toBe('DOC003');
    expect(selectDoc).toHaveBeenCalledWith(expect.objectContaining({
      code: 'DOC003',
      name: '上级医师查房记录',
    }));
  });
});
