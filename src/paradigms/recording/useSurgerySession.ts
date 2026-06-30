import { useState, useCallback, useRef } from 'react';
import { useChunkedRecorder } from '../../hooks/useChunkedRecorder';
import {
  transcribeSurgery,
  resolveRuntimeValues,
  createDocVersion,
} from '../../services/pluginRuntime';
import type { UploadResult } from '../../services/chunkUpload';

/** 单次录音记录 */
export interface SurgeryRecording {
  /** 录音序号 */
  index: number;
  /** OSS 上传结果 */
  uploadResult: UploadResult;
  /** 录音时长（秒） */
  durationSeconds: number;
}

/** 手术记录会话步骤 */
export type SurgeryStep = 'dictation' | 'review';

/** 手术记录会话状态 */
export type SurgeryStatus =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'transcribing'
  | 'reviewing'
  | 'submitting';

/** DOC013 手术记录的标准字段键 */
const SURGERY_FIELD_KEYS = [
  'operationDate',
  'operationName',
  'anesthesiaMethod',
  'operationContent',
  'postOpDiagnosis',
  'operator',
  'assistant',
] as const;

/** DOC013 字段中文标签映射 */
export const SURGERY_FIELD_LABELS: Record<string, string> = {
  operationDate: '手术日期',
  operationName: '手术名称',
  anesthesiaMethod: '麻醉方式',
  operationContent: '详细手术经过',
  postOpDiagnosis: '术后诊断',
  operator: '术者',
  assistant: '助手',
};

/** DOC013 字段排列顺序 */
export const SURGERY_FIELD_ORDER = [...SURGERY_FIELD_KEYS];

export interface UseSurgerySessionOptions {
  docCode: string;
  patientIdHis: string;
  editor: string;
}

export interface SurgerySession {
  step: SurgeryStep;
  status: SurgeryStatus;
  recordings: SurgeryRecording[];
  transcriptText: string;
  fields: Record<string, string>;
  error: string | null;

  // 录音器透传
  isRecording: boolean;
  isPaused: boolean;
  isFinishing: boolean;
  duration: number;

  // 操作
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  deleteRecording: (index: number) => void;
  generateFields: () => Promise<void>;
  updateField: (key: string, value: string) => void;
  submit: () => Promise<void>;
  reset: () => void;
  loadPreFill: () => Promise<void>;
}

/**
 * 手术记录会话管理 Hook。
 * 封装多次录音追加、ASR 转录、AI 结构化拆分、客观数据预填、版本保存的完整流程。
 */
export function useSurgerySession({
  docCode,
  patientIdHis,
  editor,
}: UseSurgerySessionOptions): SurgerySession {
  const [step, setStep] = useState<SurgeryStep>('dictation');
  const [status, setStatus] = useState<SurgeryStatus>('idle');
  const [recordings, setRecordings] = useState<SurgeryRecording[]>([]);
  const [transcriptText, setTranscriptText] = useState('');
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(SURGERY_FIELD_ORDER.map((key) => [key, ''])),
  );
  const [error, setError] = useState<string | null>(null);

  const recordingIndexRef = useRef(0);

  const recorder = useChunkedRecorder(15000);

  // ==================== 录音操作 ====================

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      await recorder.startRecording();
      setStatus('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动录音失败');
    }
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    setStatus('uploading');
    try {
      const result = await recorder.finishRecording();
      const recording: SurgeryRecording = {
        index: recordingIndexRef.current++,
        uploadResult: result,
        durationSeconds: recorder.duration,
      };
      setRecordings((prev) => [...prev, recording]);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : '录音上传失败');
      setStatus('idle');
    }
  }, [recorder]);

  const deleteRecording = useCallback((index: number) => {
    setRecordings((prev) => prev.filter((r) => r.index !== index));
  }, []);

  // ==================== AI 结构化生成 ====================

  const generateFields = useCallback(async () => {
    if (recordings.length === 0) {
      setError('请先录制至少一段口述');
      return;
    }

    setStatus('transcribing');
    setError(null);

    try {
      const audioOssIds = recordings.map((r) => r.uploadResult.ossId);
      const result = await transcribeSurgery({
        patientIdHis,
        docCode,
        audioOssIds,
        previousTranscript: transcriptText || undefined,
      });

      setTranscriptText(result.transcriptText);
      setFields((prev) => {
        const merged = { ...prev };
        for (const key of SURGERY_FIELD_ORDER) {
          if (result.fields[key]) {
            merged[key] = result.fields[key];
          }
        }
        return merged;
      });

      setStep('review');
      setStatus('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 结构化处理失败');
      setStatus('idle');
    }
  }, [recordings, patientIdHis, docCode, transcriptText]);

  // ==================== 客观数据预填 ====================

  const loadPreFill = useCallback(async () => {
    try {
      const values = await resolveRuntimeValues(docCode, patientIdHis, true);
      if (values.values) {
        setFields((prev) => {
          const merged = { ...prev };
          for (const [key, fieldValue] of Object.entries(values.values)) {
            if (SURGERY_FIELD_ORDER.includes(key as typeof SURGERY_FIELD_ORDER[number])) {
              const value = typeof fieldValue === 'object' && fieldValue !== null
                ? (fieldValue as { value?: unknown }).value
                : fieldValue;
              if (typeof value === 'string' && value.trim() && !merged[key]) {
                merged[key] = value;
              }
            }
          }
          return merged;
        });
      }
    } catch {
      // 客观数据加载失败不阻塞主流程
      console.warn('DOC013 客观数据预填加载失败');
    }
  }, [docCode, patientIdHis]);

  // ==================== 字段编辑 ====================

  const updateField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ==================== 提交 ====================

  const submit = useCallback(async () => {
    setStatus('submitting');
    setError(null);

    try {
      // 拼装正文内容（各字段按序拼接）
      const contentLines = SURGERY_FIELD_ORDER
        .filter((key) => fields[key]?.trim())
        .map((key) => `【${SURGERY_FIELD_LABELS[key]}】\n${fields[key]}`);
      const content = contentLines.join('\n\n');

      await createDocVersion(docCode, {
        docCode,
        docName: '手术记录',
        patientId: patientIdHis,
        content,
        fields,
        fieldLabels: SURGERY_FIELD_LABELS,
        fieldOrder: [...SURGERY_FIELD_ORDER],
      }, '医生确认提交手术记录', editor);

      setStatus('idle');
      setStep('dictation');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交手术记录失败');
      setStatus('reviewing');
    }
  }, [fields, docCode, patientIdHis, editor]);

  // ==================== 重置 ====================

  const reset = useCallback(() => {
    setStep('dictation');
    setStatus('idle');
    setError(null);
    // 保留已有录音，允许追加
  }, []);

  return {
    step,
    status,
    recordings,
    transcriptText,
    fields,
    error,

    isRecording: recorder.isRecording,
    isPaused: recorder.isPaused,
    isFinishing: recorder.isFinishing,
    duration: recorder.duration,

    startRecording,
    stopRecording,
    pauseRecording: recorder.pauseRecording,
    resumeRecording: recorder.resumeRecording,
    deleteRecording,
    generateFields,
    updateField,
    submit,
    reset,
    loadPreFill,
  };
}
