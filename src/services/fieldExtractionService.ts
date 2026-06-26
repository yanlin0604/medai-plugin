/**
 * 实时字段分析服务
 *
 * 只负责连接 Java /ws/field-extraction、转发最终转写文本、接收字段候选。
 * ASR 音频采集和识别由 services/asr 独立负责。
 */

export type PatientMode = 'existing' | 'new';

export interface FieldExtractionConfig {
  sessionId: string;
  docCode: string;
  patientId?: number | string | null;
  patientIdHis?: string | null;
  patientMode?: PatientMode;
  preFilledFields?: Record<string, unknown>;
  webSocketUrl?: string;
  /** @deprecated 兼容旧示例代码，请改用 webSocketUrl。 */
  javaWebSocketUrl?: string;
}

export interface DialogTurn {
  speaker: string;
  text: string;
  timestamp: number;
}

export interface CandidateValue {
  value: string;
  confidence?: number;
  sourceText?: string;
  updatedAt: number;
}

export interface FieldExtractionCandidateUpdate {
  sessionId: string;
  documentFields: Record<string, CandidateValue>;
  patientFields: Record<string, CandidateValue>;
  fields: Record<string, unknown>;
  confidence?: number;
}

export interface FieldUpdate {
  action: 'update_fields';
  session_id: string;
  fields?: Record<string, unknown>;
  document_fields?: Record<string, unknown>;
  documentFields?: Record<string, unknown>;
  patient_fields?: Record<string, unknown>;
  patientFields?: Record<string, unknown>;
  confidence?: number;
}

type IncomingFieldMessage = {
  action?: string;
  session_id?: string;
  fields?: Record<string, unknown>;
  document_fields?: Record<string, unknown>;
  documentFields?: Record<string, unknown>;
  patient_fields?: Record<string, unknown>;
  patientFields?: Record<string, unknown>;
  confidence?: number;
  message?: string;
};

export type FieldUpdateCallback = (fields: Record<string, unknown>, confidence: number) => void;
export type CandidateUpdateCallback = (update: FieldExtractionCandidateUpdate) => void;
export type ErrorCallback = (error: string) => void;

export class FieldExtractionService {
  private readonly config: FieldExtractionConfig;
  private ws: WebSocket | null = null;
  private fieldUpdateCallbacks: FieldUpdateCallback[] = [];
  private candidateUpdateCallbacks: CandidateUpdateCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private isConnected = false;

  constructor(config: FieldExtractionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const webSocketUrl = this.resolveWebSocketUrl();
    if (!webSocketUrl) {
      throw new Error('请先配置 VITE_FIELD_EXTRACTION_WS_URL。');
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(webSocketUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.isConnected = true;
        this.initSession();
        settled = true;
        resolve();
      };

      ws.onerror = () => {
        const error = new Error('字段分析 WebSocket 连接失败');
        this.handleError(error.message);
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.handleMessage(event.data);
        }
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.isConnected = false;
      };
    });
  }

  forwardFinalTranscript(turn: DialogTurn): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handleError('字段分析连接未就绪，无法分析当前转写片段。');
      return false;
    }

    this.ws.send(JSON.stringify({
      action: 'text_message',
      session_id: this.config.sessionId,
      text: turn.text,
      speaker: turn.speaker || '未知',
      timestamp: turn.timestamp,
    }));
    return true;
  }

  onFieldUpdate(callback: FieldUpdateCallback): () => void {
    this.fieldUpdateCallbacks.push(callback);
    return () => {
      this.fieldUpdateCallbacks = this.fieldUpdateCallbacks.filter((item) => item !== callback);
    };
  }

  onCandidateUpdate(callback: CandidateUpdateCallback): () => void {
    this.candidateUpdateCallbacks.push(callback);
    return () => {
      this.candidateUpdateCallbacks = this.candidateUpdateCallbacks.filter((item) => item !== callback);
    };
  }

  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((item) => item !== callback);
    };
  }

  disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'close_session',
        session_id: this.config.sessionId,
      }));
    }

    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }

  private resolveWebSocketUrl(): string {
    return String(this.config.webSocketUrl ?? this.config.javaWebSocketUrl ?? '').trim();
  }

  private initSession(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      action: 'init_session',
      session_id: this.config.sessionId,
      doc_code: this.config.docCode,
      patient_id: this.config.patientId ?? null,
      patient_id_his: this.config.patientIdHis ?? null,
      patient_mode: this.config.patientMode ?? 'existing',
      pre_filled_fields: this.config.preFilledFields ?? {},
    }));
  }

  private handleMessage(data: string): void {
    let message: IncomingFieldMessage;
    try {
      message = JSON.parse(data) as IncomingFieldMessage;
    } catch {
      return;
    }

    switch (message.action) {
      case 'session_initialized':
      case 'session_closed':
        return;
      case 'update_fields':
        this.handleFieldUpdate(message);
        return;
      case 'error':
        this.handleError(message.message || '字段分析服务返回错误');
        return;
      default:
        return;
    }
  }

  private handleFieldUpdate(message: IncomingFieldMessage): void {
    const confidence = message.confidence ?? 0;
    const documentRaw = readRecord(message.document_fields)
      ?? readRecord(message.documentFields)
      ?? readRecord(message.fields)
      ?? {};
    const patientRaw = readRecord(message.patient_fields)
      ?? readRecord(message.patientFields)
      ?? {};

    const update: FieldExtractionCandidateUpdate = {
      sessionId: message.session_id ?? this.config.sessionId,
      documentFields: normalizeCandidateMap(documentRaw, confidence),
      patientFields: normalizeCandidateMap(patientRaw, confidence),
      fields: message.fields ?? flattenCandidateMap(documentRaw),
      confidence,
    };

    if (!Object.keys(update.documentFields).length && !Object.keys(update.patientFields).length) {
      return;
    }

    this.candidateUpdateCallbacks.forEach((callback) => callback(update));
    const legacyFields = flattenCandidateMap(update.documentFields);
    this.fieldUpdateCallbacks.forEach((callback) => callback(legacyFields, confidence));
  }

  private handleError(errorMessage: string): void {
    this.errorCallbacks.forEach((callback) => callback(errorMessage));
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeCandidateMap(
  fields: Record<string, unknown>,
  fallbackConfidence: number,
): Record<string, CandidateValue> {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, normalizeCandidateValue(value, fallbackConfidence)] as const)
      .filter((entry): entry is [string, CandidateValue] => Boolean(entry[1]?.value.trim())),
  );
}

function normalizeCandidateValue(value: unknown, fallbackConfidence: number): CandidateValue {
  const now = Date.now();
  const record = readRecord(value);
  if (record) {
    const rawValue = record.value ?? record.text ?? record.content ?? '';
    return {
      value: stringifyValue(rawValue),
      confidence: toNumber(record.confidence) ?? fallbackConfidence,
      sourceText: stringifyOptional(record.sourceText ?? record.source_text),
      updatedAt: now,
    };
  }

  return {
    value: stringifyValue(value),
    confidence: fallbackConfidence,
    updatedAt: now,
  };
}

function flattenCandidateMap(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      isCandidateValue(value) ? value.value : value,
    ]),
  );
}

function isCandidateValue(value: unknown): value is CandidateValue {
  return Boolean(value && typeof value === 'object' && 'value' in value && 'updatedAt' in value);
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function stringifyOptional(value: unknown): string | undefined {
  const text = stringifyValue(value).trim();
  return text || undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
