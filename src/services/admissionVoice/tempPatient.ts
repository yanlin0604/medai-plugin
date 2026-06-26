import {
  TEMP_PATIENT_FIELD_DEFS,
  type TempPatientFieldKey,
  type TempPatientInfo,
} from './types';

export { TEMP_PATIENT_FIELD_DEFS };

export function applyTempPatientField(
  current: TempPatientInfo,
  fieldKey: string,
  value: string,
): TempPatientInfo {
  if (!isTempPatientFieldKey(fieldKey) || !value.trim()) return current;
  return {
    ...current,
    [fieldKey]: value.trim(),
  };
}

export function isTempPatientFieldKey(fieldKey: string): fieldKey is TempPatientFieldKey {
  return TEMP_PATIENT_FIELD_DEFS.some((field) => field.key === fieldKey);
}
