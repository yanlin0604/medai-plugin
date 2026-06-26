import { describe, expect, it } from 'vitest';
import { isTempAdmissionPatient, resolveAdmissionPatientMode } from './patientMode';

describe('patientMode', () => {
  it('有患者上下文时使用 existing 模式', () => {
    expect(resolveAdmissionPatientMode({ id: 'ZY001' })).toBe('existing');
  });

  it('无患者上下文时进入 new 模式', () => {
    const mode = resolveAdmissionPatientMode(null);
    expect(mode).toBe('new');
    expect(isTempAdmissionPatient(mode)).toBe(true);
  });
});
