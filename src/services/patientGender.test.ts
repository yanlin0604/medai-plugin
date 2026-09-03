import { describe, expect, it } from 'vitest';
import { normalizePatientGender } from './patientGender';

describe('normalizePatientGender', () => {
  it('maps backend gender codes to Chinese labels', () => {
    expect(normalizePatientGender('MALE')).toBe('男');
    expect(normalizePatientGender('FEMALE')).toBe('女');
  });

  it('keeps existing display labels unchanged', () => {
    expect(normalizePatientGender('男')).toBe('男');
    expect(normalizePatientGender('女')).toBe('女');
  });
});
