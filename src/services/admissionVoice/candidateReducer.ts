import {
  ADMISSION_DOCUMENT_FIELD_KEYS,
  ADMISSION_DOCUMENT_FIELD_LABELS,
  TEMP_PATIENT_FIELD_LABELS,
  type AdmissionCandidate,
  type AdmissionCandidateState,
  type FieldExtractionCandidateUpdate,
} from './types';

type CandidateAction =
  | {
    type: 'merge';
    update: FieldExtractionCandidateUpdate;
    protectedDocumentFieldKeys: string[];
    documentFieldLabels?: Record<string, string>;
  }
  | { type: 'accept_document'; fieldKey: string }
  | { type: 'accept_documents'; fieldKeys: string[] }
  | { type: 'accept_patient'; fieldKey: string }
  | { type: 'ignore_document'; fieldKey: string }
  | { type: 'ignore_patient'; fieldKey: string }
  | { type: 'clear' };

const ALLOWED_DOCUMENT_FIELDS = new Set<string>(ADMISSION_DOCUMENT_FIELD_KEYS);

export function createInitialCandidateState(): AdmissionCandidateState {
  return {
    documentFields: {},
    patientFields: {},
    acceptedDocumentFields: {},
    acceptedPatientFields: {},
  };
}

export function candidateReducer(
  state: AdmissionCandidateState,
  action: CandidateAction,
): AdmissionCandidateState {
  switch (action.type) {
    case 'merge':
      return mergeCandidateUpdate(state, action);
    case 'accept_document':
      return acceptCandidate(state, 'documentFields', 'acceptedDocumentFields', [action.fieldKey]);
    case 'accept_documents':
      return acceptCandidate(state, 'documentFields', 'acceptedDocumentFields', action.fieldKeys);
    case 'accept_patient':
      return acceptCandidate(state, 'patientFields', 'acceptedPatientFields', [action.fieldKey]);
    case 'ignore_document':
      return updateCandidateStatus(state, 'documentFields', action.fieldKey, 'ignored');
    case 'ignore_patient':
      return updateCandidateStatus(state, 'patientFields', action.fieldKey, 'ignored');
    case 'clear':
      return createInitialCandidateState();
    default:
      return state;
  }
}

export function selectSafeDocumentCandidates(
  state: AdmissionCandidateState,
  protectedDocumentFieldKeys: string[] = [],
): AdmissionCandidate[] {
  const protectedKeys = new Set(protectedDocumentFieldKeys);
  return Object.values(state.documentFields).filter(
    (candidate) =>
      candidate.status === 'pending'
      && !protectedKeys.has(candidate.key)
      && Boolean(candidate.value.trim()),
  );
}

function mergeCandidateUpdate(
  state: AdmissionCandidateState,
  action: Extract<CandidateAction, { type: 'merge' }>,
): AdmissionCandidateState {
  const protectedKeys = new Set(action.protectedDocumentFieldKeys);
  const documentLabels = {
    ...ADMISSION_DOCUMENT_FIELD_LABELS,
    ...action.documentFieldLabels,
  };

  return {
    ...state,
    documentFields: mergeGroup({
      current: state.documentFields,
      acceptedValues: state.acceptedDocumentFields,
      incoming: action.update.documentFields,
      labels: documentLabels,
      group: 'document',
      allowedKeys: ALLOWED_DOCUMENT_FIELDS,
      protectedKeys,
    }),
    patientFields: mergeGroup({
      current: state.patientFields,
      acceptedValues: state.acceptedPatientFields,
      incoming: action.update.patientFields,
      labels: TEMP_PATIENT_FIELD_LABELS,
      group: 'patient',
    }),
  };
}

function mergeGroup(options: {
  current: Record<string, AdmissionCandidate>;
  acceptedValues: Record<string, string>;
  incoming: FieldExtractionCandidateUpdate['documentFields'];
  labels: Record<string, string>;
  group: AdmissionCandidate['group'];
  allowedKeys?: Set<string>;
  protectedKeys?: Set<string>;
}): Record<string, AdmissionCandidate> {
  const next = { ...options.current };
  Object.entries(options.incoming).forEach(([key, value]) => {
    if (options.allowedKeys && !options.allowedKeys.has(key)) return;

    const text = value.value.trim();
    if (!text) return;

    const existing = next[key];
    const acceptedValue = options.acceptedValues[key];
    const sameAsIgnored = existing?.status === 'ignored' && existing.value === text;
    const sameAsAccepted = existing?.status === 'accepted' && existing.value === text;
    const hasConflict =
      Boolean(acceptedValue && acceptedValue !== text)
      || Boolean(options.protectedKeys?.has(key) && existing?.value !== text);

    next[key] = {
      ...value,
      value: text,
      key,
      label: options.labels[key] ?? key,
      group: options.group,
      status: sameAsIgnored ? 'ignored' : sameAsAccepted ? 'accepted' : hasConflict ? 'conflict' : 'pending',
    };
  });
  return next;
}

function acceptCandidate(
  state: AdmissionCandidateState,
  fieldsKey: 'documentFields' | 'patientFields',
  acceptedKey: 'acceptedDocumentFields' | 'acceptedPatientFields',
  fieldKeys: string[],
): AdmissionCandidateState {
  const nextFields = { ...state[fieldsKey] };
  const nextAccepted = { ...state[acceptedKey] };

  fieldKeys.forEach((fieldKey) => {
    const candidate = nextFields[fieldKey];
    if (!candidate) return;
    nextFields[fieldKey] = { ...candidate, status: 'accepted' };
    nextAccepted[fieldKey] = candidate.value;
  });

  return {
    ...state,
    [fieldsKey]: nextFields,
    [acceptedKey]: nextAccepted,
  };
}

function updateCandidateStatus(
  state: AdmissionCandidateState,
  fieldsKey: 'documentFields' | 'patientFields',
  fieldKey: string,
  status: AdmissionCandidate['status'],
): AdmissionCandidateState {
  const candidate = state[fieldsKey][fieldKey];
  if (!candidate) return state;
  return {
    ...state,
    [fieldsKey]: {
      ...state[fieldsKey],
      [fieldKey]: { ...candidate, status },
    },
  };
}
