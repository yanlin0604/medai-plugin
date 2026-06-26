import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserAsrSession } from '../asr/browserAsrSession';
import type { AsrServerMessage } from '../asr/types';
import { FieldExtractionService } from '../fieldExtractionService';
import {
  candidateReducer,
  createInitialCandidateState,
  selectSafeDocumentCandidates,
} from './candidateReducer';
import type {
  AdmissionCandidateState,
  AdmissionTranscriptSegment,
  PatientMode,
} from './types';

type VoiceStatus = 'idle' | 'connecting' | 'recording';

interface UseAdmissionVoiceSessionOptions {
  enabled: boolean;
  docCode: string;
  patientMode: PatientMode;
  patientId?: number | string | null;
  patientIdHis?: string | null;
  asrWebSocketUrl: string;
  fieldExtractionWebSocketUrl: string;
  preFilledFields?: Record<string, unknown>;
  protectedDocumentFieldKeys?: string[];
  documentFieldLabels?: Record<string, string>;
}

export interface UseAdmissionVoiceSessionResult {
  status: VoiceStatus;
  recording: boolean;
  connecting: boolean;
  partialText: string;
  segments: AdmissionTranscriptSegment[];
  candidates: AdmissionCandidateState;
  safeDocumentCandidates: ReturnType<typeof selectSafeDocumentCandidates>;
  asrError: string;
  analysisError: string;
  analysisConnected: boolean;
  start: () => Promise<void>;
  stop: (sendFlush?: boolean) => void;
  disconnectAnalysis: () => void;
  clearTranscripts: () => void;
  clearCandidates: () => void;
  markDocumentAccepted: (fieldKey: string) => void;
  markDocumentsAccepted: (fieldKeys: string[]) => void;
  markPatientAccepted: (fieldKey: string) => void;
  ignoreDocumentCandidate: (fieldKey: string) => void;
  ignorePatientCandidate: (fieldKey: string) => void;
}

export function useAdmissionVoiceSession(
  options: UseAdmissionVoiceSessionOptions,
): UseAdmissionVoiceSessionResult {
  const [connecting, setConnecting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [segments, setSegments] = useState<AdmissionTranscriptSegment[]>([]);
  const [asrError, setAsrError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisConnected, setAnalysisConnected] = useState(false);
  const [candidates, dispatchCandidates] = useReducer(candidateReducer, undefined, createInitialCandidateState);

  const configRef = useRef(options);
  const protectedKeysRef = useRef(options.protectedDocumentFieldKeys ?? []);
  const asrSessionRef = useRef<BrowserAsrSession | null>(null);
  const fieldServiceRef = useRef<FieldExtractionService | null>(null);
  const sessionIdRef = useRef(createSessionId(options.docCode));
  const contextKey = `${options.docCode}|${options.patientMode}|${options.patientIdHis ?? ''}|${options.patientId ?? ''}`;
  const currentProtectedKeys = options.protectedDocumentFieldKeys ?? [];
  const protectedKeysKey = (options.protectedDocumentFieldKeys ?? []).join('|');

  configRef.current = options;
  protectedKeysRef.current = currentProtectedKeys;

  useEffect(() => {
    sessionIdRef.current = createSessionId(configRef.current.docCode);
    return () => {
      asrSessionRef.current?.stop({ sendFlush: false });
      asrSessionRef.current = null;
      fieldServiceRef.current?.disconnect();
      fieldServiceRef.current = null;
      setRecording(false);
      setConnecting(false);
      setAnalysisConnected(false);
      setPartialText('');
    };
  }, [contextKey]);

  useEffect(() => {
    if (!options.enabled) {
      asrSessionRef.current?.stop({ sendFlush: false });
      asrSessionRef.current = null;
      setRecording(false);
      setConnecting(false);
      setPartialText('');
    }
  }, [options.enabled]);

  const ensureFieldService = useCallback(async (): Promise<FieldExtractionService | null> => {
    const config = configRef.current;
    if (!config.fieldExtractionWebSocketUrl.trim()) {
      setAnalysisError('未配置 VITE_FIELD_EXTRACTION_WS_URL，当前仅保留语音转文字。');
      setAnalysisConnected(false);
      return null;
    }

    const existing = fieldServiceRef.current;
    if (existing?.getConnectionState()) return existing;

    const service = new FieldExtractionService({
      sessionId: sessionIdRef.current,
      docCode: config.docCode,
      patientId: config.patientId ?? null,
      patientIdHis: config.patientIdHis ?? null,
      patientMode: config.patientMode,
      preFilledFields: config.preFilledFields ?? {},
      webSocketUrl: config.fieldExtractionWebSocketUrl,
    });

    service.onCandidateUpdate((update) => {
      dispatchCandidates({
        type: 'merge',
        update,
        protectedDocumentFieldKeys: protectedKeysRef.current,
        documentFieldLabels: configRef.current.documentFieldLabels,
      });
    });
    service.onError((errorMessage) => {
      setAnalysisError(errorMessage);
      setAnalysisConnected(false);
    });

    try {
      await service.connect();
      fieldServiceRef.current = service;
      setAnalysisError('');
      setAnalysisConnected(true);
      return service;
    } catch (error) {
      service.disconnect();
      setAnalysisConnected(false);
      setAnalysisError(error instanceof Error ? error.message : '字段分析服务连接失败，当前仅保留语音转文字。');
      return null;
    }
  }, []);

  const handleFinalMessage = useCallback((message: AsrServerMessage) => {
    // 如果服务端指定了 mode 且不为精修模式，则跳过（避免 2pass 模式下重复采纳录音片段）
    if (message.mode && message.mode !== 'refined') {
      return;
    }

    const text = (message.text ?? '').trim();
    setPartialText('');
    if (!text) return;

    const timestamp = Date.now();
    const speaker = message.speaker || '未知';
    setSegments((prev) => [
      ...prev,
      {
        id: `${timestamp}-${prev.length}`,
        text,
        speaker,
        timestamp,
      },
    ]);

    fieldServiceRef.current?.forwardFinalTranscript({
      text,
      speaker,
      timestamp,
    });
  }, []);

  const start = useCallback(async () => {
    const config = configRef.current;
    if (!config.enabled || recording || connecting) return;

    if (!config.asrWebSocketUrl.trim()) {
      setAsrError('未配置 VITE_ASR_WS_URL，无法开始语音识别。');
      return;
    }

    setConnecting(true);
    setAsrError('');
    setAnalysisError('');

    try {
      await ensureFieldService();
      const session = new BrowserAsrSession({
        websocketUrl: config.asrWebSocketUrl,
        mode: '2',
        onOpen: () => {
          setRecording(true);
          setConnecting(false);
        },
        onPartial: (message) => {
          setPartialText(message.text ?? '');
        },
        onFinal: handleFinalMessage,
        onError: (error) => {
          setAsrError(error.message);
        },
        onClose: () => {
          if (asrSessionRef.current === session) asrSessionRef.current = null;
          setRecording(false);
          setConnecting(false);
        },
      });
      asrSessionRef.current = session;
      await session.start();
    } catch (error) {
      asrSessionRef.current?.stop({ sendFlush: false });
      asrSessionRef.current = null;
      setRecording(false);
      setConnecting(false);
      setAsrError(error instanceof Error ? error.message : '语音识别启动失败。');
    }
  }, [connecting, ensureFieldService, handleFinalMessage, recording]);

  const stop = useCallback((sendFlush = true) => {
    asrSessionRef.current?.stop({ sendFlush });
    asrSessionRef.current = null;
    setRecording(false);
    setConnecting(false);
    setPartialText('');
  }, []);

  const disconnectAnalysis = useCallback(() => {
    fieldServiceRef.current?.disconnect();
    fieldServiceRef.current = null;
    setAnalysisConnected(false);
  }, []);

  const safeDocumentCandidates = useMemo(
    () => selectSafeDocumentCandidates(candidates, currentProtectedKeys),
    [candidates, protectedKeysKey],
  );

  return {
    status: connecting ? 'connecting' : recording ? 'recording' : 'idle',
    recording,
    connecting,
    partialText,
    segments,
    candidates,
    safeDocumentCandidates,
    asrError,
    analysisError,
    analysisConnected,
    start,
    stop,
    disconnectAnalysis,
    clearTranscripts: () => {
      setPartialText('');
      setSegments([]);
    },
    clearCandidates: () => dispatchCandidates({ type: 'clear' }),
    markDocumentAccepted: (fieldKey) => dispatchCandidates({ type: 'accept_document', fieldKey }),
    markDocumentsAccepted: (fieldKeys) => dispatchCandidates({ type: 'accept_documents', fieldKeys }),
    markPatientAccepted: (fieldKey) => dispatchCandidates({ type: 'accept_patient', fieldKey }),
    ignoreDocumentCandidate: (fieldKey) => dispatchCandidates({ type: 'ignore_document', fieldKey }),
    ignorePatientCandidate: (fieldKey) => dispatchCandidates({ type: 'ignore_patient', fieldKey }),
  };
}

function createSessionId(docCode: string): string {
  return `${docCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
