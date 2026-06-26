import type {
  CandidateValue,
  FieldExtractionCandidateUpdate,
  PatientMode,
} from '../fieldExtractionService';

export type { CandidateValue, FieldExtractionCandidateUpdate, PatientMode };

export const ADMISSION_DOCUMENT_FIELD_KEYS = [
  'chiefComplaint',
  'presentIllness',
  'pastHistory',
  'personalHistory',
  'familyHistory',
] as const;

export type AdmissionDocumentFieldKey = typeof ADMISSION_DOCUMENT_FIELD_KEYS[number];

export const ADMISSION_DOCUMENT_FIELD_LABELS: Record<AdmissionDocumentFieldKey, string> = {
  chiefComplaint: '主诉',
  presentIllness: '现病史',
  pastHistory: '既往史',
  personalHistory: '个人史',
  familyHistory: '家族史',
};

export const TEMP_PATIENT_FIELD_DEFS = [
  { key: 'name', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'birthDate', label: '出生日期' },
  { key: 'idNo', label: '证件号' },
  { key: 'phone', label: '联系电话' },
  { key: 'address', label: '现住址' },
  { key: 'contactName', label: '联系人' },
  { key: 'contactPhone', label: '联系人电话' },
  { key: 'maritalStatus', label: '婚姻' },
  { key: 'occupation', label: '职业' },
  { key: 'birthPlace', label: '出生地' },
  { key: 'admissionDate', label: '入院日期' },
  { key: 'deptName', label: '入院科室' },
] as const;

export type TempPatientFieldKey = typeof TEMP_PATIENT_FIELD_DEFS[number]['key'];

export const TEMP_PATIENT_FIELD_LABELS: Record<TempPatientFieldKey, string> = Object.fromEntries(
  TEMP_PATIENT_FIELD_DEFS.map((field) => [field.key, field.label]),
) as Record<TempPatientFieldKey, string>;

export type CandidateStatus = 'pending' | 'accepted' | 'ignored' | 'conflict';
export type CandidateGroup = 'document' | 'patient';

export interface AdmissionCandidate extends CandidateValue {
  key: string;
  label: string;
  group: CandidateGroup;
  status: CandidateStatus;
}

export interface AdmissionCandidateState {
  documentFields: Record<string, AdmissionCandidate>;
  patientFields: Record<string, AdmissionCandidate>;
  acceptedDocumentFields: Record<string, string>;
  acceptedPatientFields: Record<string, string>;
}

export interface AdmissionTranscriptSegment {
  id: string;
  text: string;
  speaker: string;
  timestamp: number;
}

export type TempPatientInfo = Partial<Record<TempPatientFieldKey, string>>;
