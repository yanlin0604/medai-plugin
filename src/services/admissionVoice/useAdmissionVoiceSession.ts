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
  /** 运行时模板合法文书字段键集合（用于候选过滤白名单） */
  allowedDocumentFieldKeys?: string[];
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
  start: (options: { useFieldExtraction: boolean; restartAnalysis?: boolean }) => Promise<void>;
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
  const allowedKeysRef = useRef(options.allowedDocumentFieldKeys);
  const asrSessionRef = useRef<BrowserAsrSession | null>(null);
  const fieldServiceRef = useRef<FieldExtractionService | null>(null);
  const pendingTranscriptsRef = useRef<Array<{ text: string; speaker: string; timestamp: number }>>([]);
  const restartingAnalysisRef = useRef(false);
  const sessionIdRef = useRef(createSessionId(options.docCode));
  const contextKey = `${options.docCode}|${options.patientMode}|${options.patientIdHis ?? ''}|${options.patientId ?? ''}`;
  const currentProtectedKeys = options.protectedDocumentFieldKeys ?? [];
  const protectedKeysKey = (options.protectedDocumentFieldKeys ?? []).join('|');

  configRef.current = options;
  protectedKeysRef.current = currentProtectedKeys;

  const flushPendingTranscripts = useCallback((service: FieldExtractionService) => {
    while (pendingTranscriptsRef.current.length) {
      const turn = pendingTranscriptsRef.current[0];
      if (!service.forwardFinalTranscript(turn)) return;
      pendingTranscriptsRef.current.shift();
    }
  }, []);

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

  const ensureFieldService = useCallback(async (restart = false): Promise<FieldExtractionService | null> => {
    const config = configRef.current;
    if (!config.fieldExtractionWebSocketUrl.trim()) {
      console.warn('[admission-voice] 未配置 VITE_FIELD_EXTRACTION_WS_URL，仅保留语音转文字');
      setAnalysisError('未配置 VITE_FIELD_EXTRACTION_WS_URL，当前仅保留语音转文字。');
      setAnalysisConnected(false);
      return null;
    }

    if (restart) {
      fieldServiceRef.current?.disconnect();
      fieldServiceRef.current = null;
      sessionIdRef.current = createSessionId(config.docCode);
      setAnalysisConnected(false);
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
        allowedDocumentFieldKeys: allowedKeysRef.current,
      });
    });
    service.onError((errorMessage) => {
      setAnalysisError(errorMessage);
      setAnalysisConnected(false);
    });

    fieldServiceRef.current = service;
    try {
      await service.connect();
      setAnalysisError('');
      setAnalysisConnected(true);
      flushPendingTranscripts(service);
      restartingAnalysisRef.current = false;
      return service;
    } catch (error) {
      service.disconnect();
      if (fieldServiceRef.current === service) fieldServiceRef.current = null;
      pendingTranscriptsRef.current = [];
      restartingAnalysisRef.current = false;
      setAnalysisConnected(false);
      console.error('[admission-voice] 字段分析服务连接失败:', error);
      setAnalysisError(error instanceof Error ? error.message : '字段分析服务连接失败，当前仅保留语音转文字。');
      return null;
    }
  }, [flushPendingTranscripts]);

  const handleFinalMessage = useCallback((message: AsrServerMessage) => {
    // 2-pass 协议：is_final=true 的精修定稿 mode 为 "2pass-offline"，一遍快速结果不携带 is_final，
    // 这里只采纳 final 消息（避免重复采纳录音片段）
    if (message.is_final !== true) {
      console.debug(`[admission-voice] 跳过非 final 消息: mode=${message.mode ?? '-'}, text=${(message.text ?? '').slice(0, 40)}`);
      return;
    }

    const text = (message.text ?? '').trim();
    setPartialText('');
    if (!text) {
      console.debug('[admission-voice] 忽略空文本 final 消息');
      return;
    }

    const timestamp = Date.now();
    const speaker = message.speaker || '未知';
    console.info(`[admission-voice] 收到精修转写: speaker=${speaker}, text=${text.slice(0, 60)}`);
    setSegments((prev) => [
      ...prev,
      {
        id: `${timestamp}-${prev.length}`,
        text,
        speaker,
        timestamp,
      },
    ]);

    const forwarded = restartingAnalysisRef.current ? false : fieldServiceRef.current?.forwardFinalTranscript({
      text,
      speaker,
      timestamp,
    });
    if (!forwarded) {
      if (configRef.current.fieldExtractionWebSocketUrl.trim()) {
        pendingTranscriptsRef.current.push({ text, speaker, timestamp });
      }
      console.info('[admission-voice] 字段分析连接未就绪，已暂存转写片段等待转发');
      return;
    }
    if (!forwarded) {
      console.warn('[admission-voice] 转写片段未转发到字段分析服务');
    }
  }, []);

  const start = useCallback(async (startOptions: { useFieldExtraction: boolean; restartAnalysis?: boolean }) => {
    const config = configRef.current;
    if (!config.enabled || recording || connecting) return;

    if (!config.asrWebSocketUrl.trim()) {
      setAsrError('未配置 VITE_ASR_WS_URL，无法开始语音识别。');
      return;
    }

    setConnecting(true);
    setAsrError('');
    setAnalysisError('');
    if (startOptions?.restartAnalysis) {
      restartingAnalysisRef.current = true;
      pendingTranscriptsRef.current = [];
    }
    if (!startOptions.useFieldExtraction) {
      fieldServiceRef.current?.disconnect();
      fieldServiceRef.current = null;
      pendingTranscriptsRef.current = [];
      restartingAnalysisRef.current = false;
      setAnalysisConnected(false);
    }

    try {
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
          console.error('[admission-voice] ASR 连接异常:', error.message);
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
      if (startOptions.useFieldExtraction) {
        const fieldService = await ensureFieldService(startOptions.restartAnalysis);
        if (!fieldService) {
          restartingAnalysisRef.current = false;
          pendingTranscriptsRef.current = [];
        }
      }
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
    pendingTranscriptsRef.current = [];
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
