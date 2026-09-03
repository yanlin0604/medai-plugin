import { getDocByCode } from '../../config/docRegistry';
import type { Patient } from '../../stores/usePatientStore';
import { normalizePatientGender } from '../patientGender';
import type { EmrContext } from './types';

export interface EmrContextActivation {
  patient: Patient;
  docCode: string;
}

function optionalText(value: string | undefined) {
  return value?.trim() ?? '';
}

export function buildPatientFromEmrContext(context: EmrContext): Patient {
  const patientIdHis = optionalText(context.patientIdHis);
  const inpatientNo = optionalText(context.inpatientNo);

  return {
    id: patientIdHis || inpatientNo || context.patientId,
    name: context.patientName,
    gender: normalizePatientGender(context.gender),
    age: optionalText(context.age),
    bedNo: optionalText(context.bedNo),
    deptName: optionalText(context.deptName),
    admissionDate: optionalText(context.admissionDate),
    admissionDays: Number.isFinite(context.admissionDays) ? Number(context.admissionDays) : 0,
    doctor: optionalText(context.doctor),
    diagnosis: optionalText(context.diagnosis),
  };
}

export function activateEmrContext(
  context: EmrContext,
  selectPatient: (patient: Patient) => void,
  selectDoc: (doc: NonNullable<ReturnType<typeof getDocByCode>>) => void,
): EmrContextActivation | null {
  const registryDoc = getDocByCode(context.docCode);
  if (!registryDoc) return null;

  const patient = buildPatientFromEmrContext(context);
  const doc = {
    ...registryDoc,
    name: optionalText(context.docName) || registryDoc.name,
  };
  selectPatient(patient);
  selectDoc(doc);

  return {
    patient,
    docCode: doc.code,
  };
}
