import type { PatientMode } from './types';

export function resolveAdmissionPatientMode(currentPatient: unknown): PatientMode {
  return currentPatient ? 'existing' : 'new';
}

export function isTempAdmissionPatient(patientMode: PatientMode): boolean {
  return patientMode === 'new';
}
