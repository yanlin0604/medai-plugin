import { getDocByCode } from '../../config/docRegistry';
import type { Patient } from '../../stores/usePatientStore';
import type { EmrContext } from './types';

export interface EmrContextActivation {
  patient: Patient;
  docCode: string;
}

export function buildPatientFromEmrContext(context: EmrContext): Patient {
  return {
    id: context.patientId,
    name: context.patientName,
    gender: '男',
    age: '65岁',
    bedNo: '1201',
    deptName: '心血管内科',
    admissionDate: '2026-06-01',
    admissionDays: 4,
    doctor: '林志远',
    diagnosis: '冠状动脉粥样硬化性心脏病',
  };
}

export function activateEmrContext(
  context: EmrContext,
  selectPatient: (patient: Patient) => void,
  selectDoc: (doc: NonNullable<ReturnType<typeof getDocByCode>>) => void,
): EmrContextActivation | null {
  const doc = getDocByCode(context.docCode);
  if (!doc) return null;

  const patient = buildPatientFromEmrContext(context);
  selectPatient(patient);
  selectDoc(doc);

  return {
    patient,
    docCode: doc.code,
  };
}
