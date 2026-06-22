export type EmrContextSource = 'demo-bs' | (string & {});

export type KnownEmrContextSignal =
  | 'url-doc-code'
  | 'body-dataset'
  | 'document-title'
  | 'field-marker';

export type EmrContextSignal = KnownEmrContextSignal | (string & {});

export interface EmrContext {
  source: EmrContextSource;
  patientId: string;
  patientName: string;
  docCode: string;
  docName: string;
  url?: string;
  confidence: number;
  signals: EmrContextSignal[];
  detectedAt: string;
  receivedAt: string;
}

export type EmrContextDebugStatus = 'unavailable' | 'empty' | 'accepted' | 'rejected' | 'error';

export interface EmrContextDebug {
  status: EmrContextDebugStatus;
  message: string;
  context: EmrContext | null;
  checkedAt: string;
}

export type EmrContextIdentity = Pick<EmrContext, 'patientId' | 'docCode'>;

export function getEmrContextKey(context: EmrContextIdentity) {
  return `${context.patientId}:${context.docCode}`;
}
