import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AudioOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  Loading3QuartersOutlined,
  MinusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import appIcon from '../../../src-tauri/icons/app-icon-64.png';
import { getDocByCode } from '../../config/docRegistry';
import { isRoundRecordDocCode } from '../../config/roundDocuments';
import { collapseAssistantWindow, expandAssistantWindow, showAssistBubbleWindow } from '../../services/windowMode';
import { pluginRuntimeApi, type RoundPendingSegment } from '../../services/pluginRuntime';
import { BubbleEmrContext, useBubbleStore, getBubbleContextKey } from '../../stores/useBubbleStore';
import { usePatientStore } from '../../stores/usePatientStore';
import { useFieldAssistStore } from '../../stores/useFieldAssistStore';
import { watchEmrContext } from '../../services/emrContext/watchEmrContext';
import { activateEmrContext, buildPatientFromEmrContext } from '../../services/emrContext/activateEmrContext';
import { formatEmrContextDebugLabel } from '../../services/emrContext/debugLabel';
import {
  buildBubbleDischargeDraft,
  submitBubbleDischargeDraft,
  type BubbleDischargeDraft,
} from '../../services/bubbleDischargeWriteback';
import {
  copyEditAssistSuggestion,
  fetchEditAssistSuggestions,
  getEditAssistModeLabel,
  getLatestBsEditAssistContext,
  isUsableEditAssistContext,
  resolveEditAssistType,
  type BsEditAssistContext,
  type EditAssistSuggestion,
} from '../../services/editAssistService';
import {
  getLatestFieldAssistContext,
  isUsableFieldAssistContext,
} from '../../services/fieldAssist/contextBridge';
import {
  buildSuggestionDraft,
  canGenerateField,
  generateFieldDraft,
  getFieldGenerationUnavailableMessage,
} from '../../services/fieldAssist/generation';
import { resolveFieldAssistIntent, shouldAutoGenerateField } from '../../services/fieldAssist/intentResolver';
import { applyFieldDraft, insertTextIntoFieldContext } from '../../services/fieldAssist/writeback';
import type { FieldAssistContext, FieldAssistDraft, FieldAssistIntent } from '../../services/fieldAssist/types';
import { getFieldAssistContextKey, getFieldAssistSnapshotKey } from '../../services/fieldAssist/types';
import { BrowserAsrSession } from '../../services/asr/browserAsrSession';
import type { AsrServerMessage } from '../../services/asr/types';
import { EvidenceCitationText } from '../fieldAssist/EvidenceCitationText';

interface BubbleShellProps {
  onExpand?: (context: BubbleEmrContext | null) => void;
}

type BubbleDraftStatus = 'idle' | 'generating' | 'ready' | 'writing' | 'written' | 'error';
type CopyStatus = 'idle' | 'copied' | 'error';
type FieldDraftStatus = 'idle' | 'generating' | 'ready' | 'writing' | 'written' | 'error';
type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'error';

const GENERATION_STEPS = [
  '拉取入院记录',
  '整理诊疗经过',
  '校验出院诊断',
  '生成出院医嘱',
];
const FIELD_CONTEXT_POLL_MS = 800;
const FIELD_AUTO_GENERATE_DELAY_MS = 450;
const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const ASR_MODE = '2';
const ROUND_TRANSCRIPT_FIELD_KEYS = new Set(['subjective', 'objective', 'assessment', 'plan']);
const ROUND_RECORD_FIELD_LABEL = '查房记录';

function getFieldContextSnapshotKey(context: FieldAssistContext) {
  return getFieldAssistSnapshotKey(context);
}

function getEditContextSnapshotKey(context: BsEditAssistContext) {
  return [
    context.patientId,
    context.docCode,
    context.fieldKey,
    context.compositionItemKey ?? '',
    context.selectedText,
    context.prefix,
    context.selectionStart,
    context.selectionEnd,
    context.trigger,
  ].join('|');
}

function isRoundDrivenFieldContext(context: FieldAssistContext | null): context is FieldAssistContext {
  if (!context || !isRoundRecordDocCode(context.docCode)) return false;
  if (context.docCode === 'DOC003') {
    return ROUND_TRANSCRIPT_FIELD_KEYS.has(context.fieldKey);
  }
  return context.fieldLabel === ROUND_RECORD_FIELD_LABEL;
}

function buildRoundTranscriptText(segments: RoundPendingSegment[]) {
  return segments
    .map((segment) => segment.transcribeText?.trim())
    .filter((text): text is string => Boolean(text))
    .join('\n');
}

function getSuggestionAssistType(intent: FieldAssistIntent) {
  if (intent === 'continue' || intent === 'rewrite') {
    return intent;
  }
  return null;
}

export default function BubbleShell({ onExpand }: BubbleShellProps) {
  const navigate = useNavigate();
  const { mode, detectedContext, emrDebug, expand, setDetectedContext, setEmrDebug, markActivated, hasActivated } = useBubbleStore();
  const { currentPatient, selectPatient, selectDoc } = usePatientStore();
  const setStoredFieldContext = useFieldAssistStore((state) => state.setContext);
  const addStoredFieldDraft = useFieldAssistStore((state) => state.addDraft);
  const isDetected = mode === 'detected' && Boolean(detectedContext);
  const contextKey = detectedContext ? getBubbleContextKey(detectedContext) : '';
  const detectedDocName = detectedContext?.docName ?? '';
  const [draftStatus, setDraftStatus] = useState<BubbleDraftStatus>('idle');
  const [preparedDraft, setPreparedDraft] = useState<BubbleDischargeDraft | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [editContext, setEditContext] = useState<BsEditAssistContext | null>(null);
  const [fieldContext, setFieldContext] = useState<FieldAssistContext | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldAssistDraft | null>(null);
  const [fieldDraftStatus, setFieldDraftStatus] = useState<FieldDraftStatus>('idle');
  const [fieldStatusText, setFieldStatusText] = useState('');
  const latestFieldContextKeyRef = useRef('');
  const latestFieldSnapshotKeyRef = useRef('');
  const latestEditSnapshotKeyRef = useRef('');
  const latestDraftContextKeyRef = useRef('');
  const draftProgressTimerRef = useRef<number | null>(null);
  const autoGenerateRequestKeysRef = useRef<Set<string>>(new Set());
  const detectedContextRef = useRef<BubbleEmrContext | null>(null);
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false);
  const generatingContextKeyRef = useRef('');
  const fieldDraftStickyRef = useRef(false);
  const [suggestionBatch, setSuggestionBatch] = useState(0);
  const [suggestions, setSuggestions] = useState<EditAssistSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const [suggestionErrorText, setSuggestionErrorText] = useState('');
  const suggestionRequestKeyRef = useRef('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copiedSuggestionId, setCopiedSuggestionId] = useState('');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const voiceContextKeyRef = useRef('');
  const finalVoiceDraftRef = useRef('');
  const voiceBaseContextRef = useRef<FieldAssistContext | null>(null);
  const voiceSessionRef = useRef<BrowserAsrSession | null>(null);
  const generatedPatient = useMemo(
    () => (detectedContext ? buildPatientFromEmrContext(detectedContext) : null),
    [contextKey],
  );
  const shouldAutoGenerateCurrentField = useMemo(() => {
    if (!fieldContext || !canGenerateField(fieldContext)) return false;
    if (isRoundRecordDocCode(fieldContext.docCode) && !isRoundDrivenFieldContext(fieldContext)) {
      return false;
    }
    return shouldAutoGenerateField(fieldContext, fieldDraft);
  }, [fieldContext, fieldDraft]);
  const editContextKey = useMemo(
    () =>
      editContext
        ? [
          editContext.patientId,
          editContext.docCode,
          editContext.fieldKey,
          editContext.selectedText,
          editContext.prefix,
          editContext.selectionStart,
          editContext.selectionEnd,
        ].join('|')
      : '',
    [editContext],
  );

  const resolveRoundTranscriptText = async (context: FieldAssistContext) => {
    if (!isRoundDrivenFieldContext(context)) {
      return undefined;
    }
    const pendingStatus = await pluginRuntimeApi.getRoundPendingStatus(
      context.patientId,
      currentPatient?.doctor || '',
    );
    const transcriptText = buildRoundTranscriptText(
      (pendingStatus.assignedSegments ?? []).filter((segment) => segment.status !== 'ignored'),
    );
    if (!transcriptText.trim()) {
      throw new Error('当前患者暂无可用查房片段');
    }
    return transcriptText;
  };

  const generateContextAwareFieldDraft = async (context: FieldAssistContext) => {
    const transcriptText = await resolveRoundTranscriptText(context);
    const effectiveContext = transcriptText ? { ...context, fieldValue: '' } : context;
    return generateFieldDraft(effectiveContext, undefined, transcriptText);
  };
  const fieldIntent: FieldAssistIntent = useMemo(
    () => (fieldContext ? resolveFieldAssistIntent(fieldContext, fieldDraft) : 'idle'),
    [fieldContext, fieldDraft],
  );
  const fieldContextKey = fieldContext ? getFieldAssistContextKey(fieldContext) : '';

  useEffect(() => {
    const fieldSuggestionAssistType = fieldContext && canGenerateField(fieldContext)
      ? getSuggestionAssistType(fieldIntent)
      : null;
    const suggestionAssistType = editContext
      ? resolveEditAssistType(editContext)
      : fieldSuggestionAssistType ?? undefined;
    const suggestionContext = editContext ?? (fieldContext && fieldSuggestionAssistType
      ? { ...fieldContext, source: 'demo-cs' } as BsEditAssistContext
      : null);

    if (!suggestionContext) {
      suggestionRequestKeyRef.current = '';
      setSuggestions([]);
      setSuggestionStatus('idle');
      setSuggestionErrorText('');
      return;
    }

    const requestKey = [
      suggestionContext.patientId,
      suggestionContext.docCode,
      suggestionContext.fieldKey,
      suggestionContext.compositionItemKey ?? '',
      suggestionContext.fieldValue,
      suggestionContext.selectedText,
      suggestionContext.prefix,
      suggestionContext.selectionStart,
      suggestionContext.selectionEnd,
      suggestionAssistType ?? '',
      suggestionBatch,
    ].join('|');

    suggestionRequestKeyRef.current = requestKey;
    setSuggestionStatus('loading');
    setSuggestionErrorText('');

    void fetchEditAssistSuggestions(suggestionContext, suggestionBatch, suggestionAssistType)
      .then((items) => {
        if (suggestionRequestKeyRef.current !== requestKey) return;
        setSuggestions(items);
        setSuggestionStatus('ready');
      })
      .catch((error) => {
        if (suggestionRequestKeyRef.current !== requestKey) return;
        setSuggestions([]);
        setSuggestionStatus('error');
        setSuggestionErrorText(error instanceof Error ? error.message : '候选加载失败');
      });
  }, [editContext, fieldContext, fieldIntent, suggestionBatch]);

  useEffect(() => {
    latestFieldContextKeyRef.current = fieldContextKey;
  }, [fieldContextKey]);

  useEffect(() => {
    detectedContextRef.current = detectedContext;
  }, [detectedContext]);

  const clearFieldAssistState = () => {
    latestFieldSnapshotKeyRef.current = '';
    latestFieldContextKeyRef.current = '';
    generatingContextKeyRef.current = '';
    fieldDraftStickyRef.current = false;
    autoGenerateRequestKeysRef.current.clear();
    setFieldContext(null);
    setFieldDraft(null);
    setFieldDraftStatus('idle');
    setFieldStatusText('');
    setStoredFieldContext(null);
  };

  // 追踪草稿是否处于可展示状态（ready/written/error），用于防止轮询误清 context
  useEffect(() => {
    fieldDraftStickyRef.current =
      fieldDraftStatus === 'ready' || fieldDraftStatus === 'written' || fieldDraftStatus === 'error';
  }, [fieldDraftStatus]);

  // 监听 EMR 上下文变化，只更新气泡状态，不自动展开
  useEffect(() => {
    const cleanup = watchEmrContext(
      (context) => {
        setDetectedContext(context);
      },
      { onDebug: setEmrDebug },
    );

    return cleanup;
  }, [setDetectedContext, setEmrDebug]);

  useEffect(() => {
    let disposed = false;

    const pollEditContext = async () => {
      const field = await getLatestFieldAssistContext();
      if (disposed) return;
      const usableField = isUsableFieldAssistContext(field) ? field : null;
      if (usableField) {
        const activeDetectedContext = detectedContextRef.current;
        if (
          activeDetectedContext
          && (
            usableField.patientId !== activeDetectedContext.patientId
            || usableField.docCode !== activeDetectedContext.docCode
          )
        ) {
          clearFieldAssistState();
          return;
        }

        const nextSnapshotKey = getFieldContextSnapshotKey(usableField);
        if (nextSnapshotKey !== latestFieldSnapshotKeyRef.current) {
          // 如果正在生成中且字段仍为空，跳过同字段微变防止生成被取消；
          // 一旦医生开始输入或划词，必须更新上下文，让气泡切到输入候选或改写候选。
          const isGenerating = generatingContextKeyRef.current !== '';
          const sameField = isGenerating
            && generatingContextKeyRef.current === getFieldAssistContextKey(usableField);
          const hasDoctorEdit = Boolean(usableField.fieldValue.trim() || usableField.selectedText.trim());
          if (sameField && !hasDoctorEdit) {
            // 仅更新快照 key 记录，不更新 state 以避免打断生成
            latestFieldSnapshotKeyRef.current = nextSnapshotKey;
          } else {
            latestFieldSnapshotKeyRef.current = nextSnapshotKey;
            setFieldContext(usableField);
            setStoredFieldContext(usableField);
          }
        }
        if (latestEditSnapshotKeyRef.current) {
          latestEditSnapshotKeyRef.current = '';
          setEditContext(null);
        }
        return;
      }

      // 正在生成中 或 草稿已就绪（医生可能在看卡片内容）时，不因轮询丢失而清空字段
      if (generatingContextKeyRef.current || fieldDraftStickyRef.current) return;

      if (latestFieldSnapshotKeyRef.current) {
        latestFieldSnapshotKeyRef.current = '';
        setFieldContext(null);
        setStoredFieldContext(null);
      }

      const context = await getLatestBsEditAssistContext();
      if (disposed) return;
      const usableEdit = isUsableEditAssistContext(context) ? context : null;
      if (!usableEdit) {
        if (latestEditSnapshotKeyRef.current) {
          latestEditSnapshotKeyRef.current = '';
          setEditContext(null);
        }
        return;
      }

      const nextEditSnapshotKey = getEditContextSnapshotKey(usableEdit);
      if (nextEditSnapshotKey !== latestEditSnapshotKeyRef.current) {
        latestEditSnapshotKeyRef.current = nextEditSnapshotKey;
        setEditContext(usableEdit);
      }
    };

    void pollEditContext();
    const timer = window.setInterval(() => {
      void pollEditContext();
    }, FIELD_CONTEXT_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [setStoredFieldContext]);

  useEffect(() => {
    if (
      fieldContext
      && detectedContext
      && (
        fieldContext.patientId !== detectedContext.patientId
        || fieldContext.docCode !== detectedContext.docCode
      )
    ) {
      clearFieldAssistState();
      setIsManuallyCollapsed(false);
      return;
    }

    setSuggestionBatch(0);
    setCopyStatus('idle');
    setCopiedSuggestionId('');
  }, [editContextKey]);

  useEffect(() => {
    setIsManuallyCollapsed(false);
    setSuggestionBatch(0);
    setCopyStatus('idle');
    setCopiedSuggestionId('');
    closeVoicePanel();
    setVoiceText('');

    if (fieldContext && !canGenerateField(fieldContext)) {
      setFieldStatusText(getFieldGenerationUnavailableMessage(fieldContext));
      setFieldDraft(null);
      setFieldDraftStatus('idle');
      return;
    }

    if (fieldContextKey) {
      const drafts = useFieldAssistStore.getState().drafts;
      const restoredDraft = drafts.find((d) => d.contextKey === fieldContextKey);
      if (restoredDraft) {
        setFieldDraft(restoredDraft);
        setFieldDraftStatus('ready');
        setFieldStatusText('');
        return;
      }
    }

    setFieldStatusText('');
    setFieldDraft(null);
    setFieldDraftStatus('idle');
  }, [detectedContext, fieldContext, fieldContextKey]);

  useEffect(() => () => {
    stopVoiceRecording(false);
  }, []);

  useEffect(() => {
    if (fieldContext) {
      // 用户手动收起后，不自动展开，直到新字段上下文到来
      if (isManuallyCollapsed) {
        void collapseAssistantWindow();
        return;
      }
      const isWaitingForAutoGenerate =
        fieldDraftStatus === 'idle' && shouldAutoGenerateCurrentField;
      if (isWaitingForAutoGenerate || fieldDraftStatus === 'generating') {
        // 仅在等待自动生成和生成中时收缩为气泡
        void collapseAssistantWindow();
        return;
      }
      // ready / writing / written / error 都保持卡片展示
      void showAssistBubbleWindow();
      return;
    }
    if (editContext) {
      void showAssistBubbleWindow();
      return;
    }
    void collapseAssistantWindow();
  }, [editContext, fieldContext, fieldDraft, fieldDraftStatus, isManuallyCollapsed]);

  useEffect(() => {
    if (!fieldContext || !shouldAutoGenerateCurrentField) return;
    const requestKey = `${fieldContextKey}:auto`;
    if (autoGenerateRequestKeysRef.current.has(requestKey)) return;
    // 防竞态：如果已有另一个上下文正在生成，先等其取消
    if (generatingContextKeyRef.current && generatingContextKeyRef.current !== fieldContextKey) return;

    let cancelled = false;
    let requestStarted = false;
    autoGenerateRequestKeysRef.current.add(requestKey);
    generatingContextKeyRef.current = fieldContextKey;
    setFieldDraftStatus('generating');
    setFieldStatusText('正在生成');

    const timer = window.setTimeout(() => {
      requestStarted = true;
      generateContextAwareFieldDraft(fieldContext)
        .then((draft) => {
          if (cancelled) return;
          setFieldDraft(draft);
          addStoredFieldDraft(draft);
          setFieldDraftStatus('ready');
          setFieldStatusText('字段草稿已生成');
        })
        .catch((error) => {
          if (cancelled) return;
          setFieldDraftStatus('error');
          setFieldStatusText(error instanceof Error ? error.message : '生成失败');
        });
    }, FIELD_AUTO_GENERATE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!requestStarted) {
        autoGenerateRequestKeysRef.current.delete(requestKey);
      }
      if (generatingContextKeyRef.current === fieldContextKey) {
        generatingContextKeyRef.current = '';
      }
    };
  }, [addStoredFieldDraft, fieldContext, fieldContextKey, shouldAutoGenerateCurrentField]);

  useEffect(() => {
    if (!fieldContextKey) return;
    autoGenerateRequestKeysRef.current = new Set(
      [...autoGenerateRequestKeysRef.current].filter((key) => key.startsWith(`${fieldContextKey}:`)),
    );
  }, [fieldContextKey]);

  useEffect(() => {
    latestDraftContextKeyRef.current = contextKey;
    if (draftProgressTimerRef.current !== null) {
      window.clearInterval(draftProgressTimerRef.current);
      draftProgressTimerRef.current = null;
    }
    setDraftStatus('idle');
    setPreparedDraft(null);
    setProgress(0);
    setStatusText('');
    return () => {
      if (draftProgressTimerRef.current !== null) {
        window.clearInterval(draftProgressTimerRef.current);
        draftProgressTimerRef.current = null;
      }
    };
  }, [contextKey]);

  const handleExpand = () => {
    if (fieldContext) {
      if (!currentPatient || currentPatient.id !== fieldContext.patientId) {
        selectPatient({
          id: fieldContext.patientId,
          name: fieldContext.patientName,
          gender: '',
          age: '',
          bedNo: '',
          deptName: '',
          admissionDate: '',
          admissionDays: 0,
          doctor: '林志远',
          diagnosis: '',
        });
      }
      const doc = getDocByCode(fieldContext.docCode);
      if (doc) selectDoc(doc);
      navigate(`/doc/${fieldContext.docCode}`);
      expand(detectedContext);
      void expandAssistantWindow();
      onExpand?.(detectedContext);
      return;
    }

    // 如果是检测态气泡，需要关联患者与文书
    if (isDetected && detectedContext) {
      // 避免重复激活同一上下文
      if (!hasActivated(contextKey)) {
        const activation = activateEmrContext(detectedContext, selectPatient, selectDoc);
        if (activation) {
          markActivated(contextKey);
          navigate(`/doc/${activation.docCode}`);
        }
      }
    }

    // 展开窗口
    expand(detectedContext);
    void expandAssistantWindow();
    onExpand?.(detectedContext);
  };

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleExpand();
  };

  const handleCollapseToBubble = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsManuallyCollapsed(true);
    void collapseAssistantWindow();
  };

  const stopVoiceRecording = (sendFlush = true) => {
    voiceSessionRef.current?.stop({ sendFlush });
    voiceSessionRef.current = null;
    setVoiceRecording(false);
  };

  const closeVoicePanel = () => {
    stopVoiceRecording();
    setVoicePanelOpen(false);
    voiceContextKeyRef.current = '';
    finalVoiceDraftRef.current = '';
    voiceBaseContextRef.current = null;
  };

  const clearVoiceDraft = () => {
    finalVoiceDraftRef.current = '';
    voiceBaseContextRef.current = fieldContext
      ? {
        ...fieldContext,
        fieldValue: '',
        selectedText: '',
        selectionStart: 0,
        selectionEnd: 0,
      }
      : null;
    setVoiceText('');
  };

  const writeVoiceTranscript = (contextKey: string, transcriptDraft: string) => {
    if (voiceContextKeyRef.current !== contextKey) return;
    const baseContext = voiceBaseContextRef.current ?? fieldContext;
    if (!baseContext) return;
    setVoiceText(insertTextIntoFieldContext(baseContext, transcriptDraft).text);
  };

  const handleAsrMessage = (data: AsrServerMessage) => {
    const contextKey = voiceContextKeyRef.current;
    if (!contextKey) return;

    if (!data.text && data.is_final) {
      writeVoiceTranscript(contextKey, finalVoiceDraftRef.current);
      return;
    }
    if (!data.text) return;

    const nextDraft = `${finalVoiceDraftRef.current}${data.text}`;
    writeVoiceTranscript(contextKey, nextDraft);

    if (data.is_final !== false) {
      finalVoiceDraftRef.current = nextDraft;
    }
  };

  const handleVoiceTextChange = (nextText: string) => {
    finalVoiceDraftRef.current = nextText;
    voiceBaseContextRef.current = fieldContext
      ? {
        ...fieldContext,
        fieldValue: '',
        selectedText: '',
        selectionStart: 0,
        selectionEnd: 0,
      }
      : null;
    setVoiceText(nextText);
  };

  const handleToggleVoiceRecording = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!fieldContext) {
      message.warning('请先在 HIS 中聚焦一个字段。');
      return;
    }

    if (voiceRecording) {
      stopVoiceRecording();
      return;
    }

    if (!ASR_WS_URL) {
      message.error('请先在 .env 中配置 VITE_ASR_WS_URL。');
      return;
    }

    const requestContextKey = fieldContextKey;
    stopVoiceRecording(false);
    voiceContextKeyRef.current = requestContextKey;
    voiceBaseContextRef.current = fieldContext;
    finalVoiceDraftRef.current = '';
    setVoiceText(fieldContext.fieldValue);
    setVoicePanelOpen(true);
    setVoiceRecording(true);

    try {
      const session = new BrowserAsrSession({
        websocketUrl: ASR_WS_URL,
        mode: ASR_MODE,
        onPartial: handleAsrMessage,
        onFinal: handleAsrMessage,
        onError: (error) => {
          message.error(error.message);
        },
        onClose: () => {
          if (voiceSessionRef.current === session) voiceSessionRef.current = null;
          setVoiceRecording(false);
        },
      });
      voiceSessionRef.current = session;
      await session.start();
      if (voiceContextKeyRef.current !== requestContextKey) {
        session.stop({ sendFlush: false });
      }
    } catch (error) {
      stopVoiceRecording(false);
      message.error(error instanceof Error ? error.message : '无法获取麦克风权限。');
    }
  };

  const handleApplyVoiceDraft = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!fieldContext || !voiceText.trim() || fieldDraftStatus === 'writing') return;
    const baseContext = voiceBaseContextRef.current ?? fieldContext;

    const draft = buildSuggestionDraft(fieldContext, voiceText.trim(), '语音转写回填');
    const finalText = finalVoiceDraftRef.current.trim() || voiceText.trim();
    setFieldDraftStatus('writing');
    setFieldStatusText('正在回填语音草稿');
    void applyFieldDraft({
      context: baseContext,
      response: draft.response,
      finalText,
      mode: baseContext.fieldValue.trim() ? 'replaceSelection' : 'overwrite',
      doctorName: '林志远 主治医师',
    })
      .then(() => {
        setFieldDraftStatus('written');
        closeVoicePanel();
      })
      .catch((error) => {
        setFieldDraftStatus('error');
        setFieldStatusText(error instanceof Error ? error.message : '语音草稿回填失败');
      });
  };

  const applyBubbleDischargeDraft = async (
    draft: BubbleDischargeDraft,
    patient = generatedPatient,
    docName = detectedContext?.docName,
  ) => {
    if (!patient || !docName) return;

    setDraftStatus('writing');
    setStatusText('正在回写病历系统');
    setProgress(100);

    let result;
    try {
      result = await submitBubbleDischargeDraft(
        patient,
        docName,
        '林志远 主治医师',
        { preparedDraft: draft },
      );
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '回写失败，点开处理';
      setDraftStatus('error');
      setStatusText(messageText);
      return;
    }
    if (result.ok) {
      setDraftStatus('written');
      setStatusText(result.historyCreated ? '已回写并生成历史' : result.message);
      return;
    }

    if (result.written) {
      setDraftStatus('error');
      setStatusText('已回写，历史生成失败');
      return;
    }

    setDraftStatus('error');
    setStatusText('回写失败，点开处理');
  };

  const handleWriteback = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!detectedContext || !generatedPatient || !preparedDraft || draftStatus === 'writing') return;
    await applyBubbleDischargeDraft(preparedDraft);
  };

  const handleRegenerateDraft = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!detectedContext || !detectedDocName || !generatedPatient || isWorking) return;

    setIsManuallyCollapsed(true);
    void collapseAssistantWindow();
    setDraftStatus('generating');
    setPreparedDraft(null);
    setProgress(8);
    setStatusText(GENERATION_STEPS[0]);

    const requestContextKey = contextKey;
    latestDraftContextKeyRef.current = requestContextKey;
    let tick = 0;
    if (draftProgressTimerRef.current !== null) {
      window.clearInterval(draftProgressTimerRef.current);
    }
    draftProgressTimerRef.current = window.setInterval(() => {
      tick += 1;
      const nextProgress = Math.min(92, 8 + tick * 7);
      const stepIndex = Math.min(
        GENERATION_STEPS.length - 1,
        Math.floor((nextProgress / 100) * GENERATION_STEPS.length),
      );
      setProgress(nextProgress);
      setStatusText(GENERATION_STEPS[stepIndex]);
    }, 260);

    void buildBubbleDischargeDraft(generatedPatient, detectedDocName, { forceRefresh: true })
      .then((draft) => {
        if (latestDraftContextKeyRef.current !== requestContextKey) return;
        if (draftProgressTimerRef.current !== null) {
          window.clearInterval(draftProgressTimerRef.current);
          draftProgressTimerRef.current = null;
        }
        setPreparedDraft(draft);
        setProgress(100);
        setStatusText(
          draft.missingFields.length
            ? `出院记录已生成，缺少：${draft.missingFields.join('、')}，可先回填`
            : '出院记录已生成，请回填',
        );
        setDraftStatus('ready');
      })
      .catch((error) => {
        if (latestDraftContextKeyRef.current !== requestContextKey) return;
        if (draftProgressTimerRef.current !== null) {
          window.clearInterval(draftProgressTimerRef.current);
          draftProgressTimerRef.current = null;
        }
        const messageText = error instanceof Error ? error.message : '字段生成失败，点开处理';
        setPreparedDraft(null);
        setProgress(100);
        setStatusText(messageText);
        setDraftStatus('error');
      });
  };

  const handleRefreshSuggestions = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSuggestionBatch((value) => value + 1);
    setCopyStatus('idle');
    setCopiedSuggestionId('');
  };

  const handleRegenerateField = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!fieldContext || fieldDraftStatus === 'generating' || fieldDraftStatus === 'writing') return;
    if (!canGenerateField(fieldContext)) {
      setFieldStatusText(getFieldGenerationUnavailableMessage(fieldContext));
      return;
    }
    const requestContextKey = fieldContextKey;
    setFieldDraftStatus('generating');
    setFieldStatusText('正在重新生成');
    void generateContextAwareFieldDraft(fieldContext)
      .then((draft) => {
        if (latestFieldContextKeyRef.current !== requestContextKey) return;
        setFieldDraft(draft);
        addStoredFieldDraft(draft);
        setFieldDraftStatus('ready');
        setFieldStatusText('字段草稿已生成');
      })
      .catch((error) => {
        if (latestFieldContextKeyRef.current !== requestContextKey) return;
        setFieldDraftStatus('error');
        setFieldStatusText(error instanceof Error ? error.message : '生成失败');
      });
  };

  const handleApplyFieldDraft = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const currentDraft = fieldDraft?.contextKey === fieldContextKey ? fieldDraft : null;
    if (!fieldContext || !currentDraft || fieldDraftStatus !== 'ready') return;
    setFieldDraftStatus('writing');
    setFieldStatusText('正在回填当前字段');
    void applyFieldDraft({
      context: fieldContext,
      response: currentDraft.response,
      doctorName: '林志远 主治医师',
    })
      .then(() => {
        setFieldDraftStatus('written');
      })
      .catch((error) => {
        setFieldDraftStatus('error');
        setFieldStatusText(error instanceof Error ? error.message : '回填失败');
      });
  };

  const handleApplyFieldSuggestion = (event: MouseEvent<HTMLButtonElement>, suggestion: EditAssistSuggestion) => {
    event.stopPropagation();
    if (!fieldContext || fieldDraftStatus === 'writing') return;
    const draftLabel = fieldIntent === 'rewrite' ? '改写选区' : '输入候选';
    const draft = buildSuggestionDraft(fieldContext, suggestion.text, draftLabel);
    setFieldDraft(draft);
    addStoredFieldDraft(draft);
    setFieldDraftStatus('writing');
    setFieldStatusText('正在回填当前字段');
    void applyFieldDraft({
      context: fieldContext,
      response: draft.response,
      doctorName: '林志远 主治医师',
    })
      .then(() => {
        setFieldDraftStatus('written');
      })
      .catch((error) => {
        setFieldDraftStatus('error');
        setFieldStatusText(error instanceof Error ? error.message : '回填失败');
      });
  };

  const handleCopySuggestion = async (
    event: MouseEvent<HTMLButtonElement>,
    suggestion: EditAssistSuggestion,
  ) => {
    event.stopPropagation();
    try {
      await copyEditAssistSuggestion(suggestion.text);
      setCopyStatus('copied');
      setCopiedSuggestionId(suggestion.id);
      window.setTimeout(() => {
        setCopyStatus('idle');
        setCopiedSuggestionId('');
      }, 1800);
    } catch {
      setCopyStatus('error');
      setCopiedSuggestionId(suggestion.id);
    }
  };

  const canWriteback = Boolean(detectedContext && generatedPatient && preparedDraft)
    && (draftStatus === 'ready' || draftStatus === 'error');
  const isWorking = draftStatus === 'generating' || draftStatus === 'writing';
  const hasPreparedDraft = Boolean(detectedContext && generatedPatient && preparedDraft)
    && (draftStatus === 'ready' || draftStatus === 'error' || draftStatus === 'written');
  const canGenerateDraft = isDetected && Boolean(detectedContext && detectedDocName) && !isWorking;
  const draftStatusLabel =
    draftStatus === 'written' ? '已回写'
      : draftStatus === 'ready' ? '可回写'
        : draftStatus === 'writing' ? '回写中'
          : draftStatus === 'generating' ? '生成中'
            : draftStatus === 'error' ? '处理失败'
              : '待书写';

  if (fieldContext) {
    const fieldGenerationAvailable = canGenerateField(fieldContext);
    const hasSuggestionIntent = fieldGenerationAvailable
      && Boolean(getSuggestionAssistType(fieldIntent));
    const currentFieldDraft = fieldDraft?.contextKey === fieldContextKey ? fieldDraft : null;
    const fieldSuggestions = hasSuggestionIntent ? suggestions : [];
    const isFieldBusy = fieldDraftStatus === 'generating' || fieldDraftStatus === 'writing';
    const fieldGenerationUnavailableText = getFieldGenerationUnavailableMessage(fieldContext);
    const canApplyField = Boolean(currentFieldDraft) && fieldDraftStatus === 'ready';
    const fieldActionLabel = fieldDraftStatus === 'writing'
      ? '正在回填'
      : fieldDraftStatus === 'generating'
        ? '正在生成'
        : '正在书写';
    const fieldActionText = `${fieldActionLabel}${fieldContext.fieldLabel}字段`;
    const voiceDraftPanel = voicePanelOpen ? (
      <div className="border-t border-blue-100 bg-blue-50/70 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[10px] font-bold text-[#1E3A8A]">
            {voiceRecording ? '正在听写' : '语音草稿'}：{fieldContext.fieldLabel}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={handleToggleVoiceRecording}
              className="inline-flex h-6 items-center gap-1 rounded border border-blue-100 bg-white px-1.5 text-[10px] font-bold text-[#1E3A8A] hover:bg-blue-50"
            >
              <AudioOutlined className={voiceRecording ? 'animate-pulse' : undefined} />
              {voiceRecording ? '停止' : '继续'}
            </button>
            {voiceText ? (
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={(event) => {
                  event.stopPropagation();
                  clearVoiceDraft();
                }}
                className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-slate-700"
              >
                <CloseOutlined />
                清空
              </button>
            ) : null}
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={handleApplyVoiceDraft}
              disabled={!voiceText.trim() || fieldDraftStatus === 'writing'}
              className="inline-flex h-6 items-center gap-1 rounded bg-emerald-600 px-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadOutlined />
              回填
            </button>
          </div>
        </div>
        <textarea
          data-tauri-drag-region="false"
          value={voiceText}
          onChange={(event) => handleVoiceTextChange(event.target.value)}
          className="h-14 w-full resize-none rounded border border-blue-100 bg-white px-2 py-1.5 text-[11px] leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1E3A8A]"
          placeholder={voiceRecording ? '正在听写，转写内容会显示在这里...' : '语音转写内容会显示在这里'}
        />
      </div>
    ) : null;

    if (isFieldBusy || (fieldDraftStatus === 'idle' && shouldAutoGenerateCurrentField) || isManuallyCollapsed) {
      const collapsedTitle = !fieldGenerationAvailable
        ? `${fieldContext.patientName} · 手动编辑`
        : isWorking
          ? `${detectedContext?.patientName ?? fieldContext.patientName} · ${draftStatusLabel}`
          : `${fieldContext.patientName} · ${fieldActionLabel}`;
      const collapsedSubtitle = !fieldGenerationAvailable
        ? fieldGenerationUnavailableText
        : isWorking
          ? (statusText || detectedContext?.docName || fieldContext.docName)
          : fieldActionText;

      return (
        <div
          role="button"
          tabIndex={0}
          data-tauri-drag-region
          onDoubleClick={handleExpand}
          onKeyDown={handleShellKeyDown}
          className="relative flex h-full w-full items-center justify-between gap-2 overflow-hidden border border-emerald-500 bg-white px-2.5 py-2 text-left shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1"
          style={{ cursor: 'move' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              data-tauri-drag-region
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"
            >
              {isWorking ? (
                <Loading3QuartersOutlined className="text-base animate-spin" />
              ) : (
                <EditOutlined className={isFieldBusy ? "text-base animate-pen-writing" : "text-base"} />
              )}
              <span
                data-tauri-drag-region
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm"
              />
            </div>
            <div data-tauri-drag-region className="min-w-0 flex-1">
              <div data-tauri-drag-region className="truncate text-[11px] font-bold text-emerald-700">
                {collapsedTitle}
              </div>
              <div data-tauri-drag-region className="mt-0.5 truncate text-[9px] font-medium text-slate-500">
                {collapsedSubtitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isWorking ? (
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleExpand}
                className="flex h-8 w-8 items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700"
                title="查看处理状态"
                aria-label="查看处理状态"
              >
                <ArrowRightOutlined className="text-xs" />
              </button>
            ) : hasPreparedDraft ? (
              <>
                <button
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={handleRegenerateDraft}
                  className="flex h-8 w-8 items-center justify-center border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                  title="重新生成出院记录"
                  aria-label="重新生成出院记录"
                >
                  <ReloadOutlined className="text-xs" />
                </button>
                {canWriteback ? (
                  <button
                    type="button"
                    data-tauri-drag-region="false"
                    onClick={handleWriteback}
                    className="flex h-8 w-8 items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700"
                    title="回填出院记录"
                    aria-label="回填出院记录"
                  >
                    <UploadOutlined className="text-xs" />
                  </button>
                ) : (
                  <button
                    type="button"
                    data-tauri-drag-region="false"
                    onClick={handleExpand}
                    className="flex h-8 w-8 items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700"
                    title="进入出院记录"
                    aria-label="进入出院记录"
                  >
                    <ArrowRightOutlined className="text-xs" />
                  </button>
                )}
              </>
            ) : canGenerateDraft ? (
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleRegenerateDraft}
                className="flex h-8 min-w-[76px] items-center justify-center gap-1 border border-emerald-200 bg-white px-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                title="生成全文"
                aria-label="生成全文"
              >
                <FileTextOutlined className="text-xs" />
                生成全文
              </button>
            ) : null}
          </div>
          {isWorking ? (
            <div data-tauri-drag-region className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-100">
              <div
                data-tauri-drag-region
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        data-tauri-drag-region
        onDoubleClick={handleExpand}
        className={[
          'w-full h-full bg-white border border-emerald-500 shadow-xl overflow-hidden',
          'flex flex-col text-left',
        ].join(' ')}
        style={{ cursor: 'move' }}
      >
        <div data-tauri-drag-region className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
          <div data-tauri-drag-region className="flex items-start justify-between gap-2">
            <div data-tauri-drag-region className="min-w-0">
              <div data-tauri-drag-region className="text-[11px] font-bold text-emerald-700 truncate">
                {fieldContext.fieldLabel} · {!fieldGenerationAvailable ? '手动编辑' : fieldIntent === 'rewrite' ? '改写选区' : fieldIntent === 'continue' ? '输入候选' : '字段生成'}
              </div>
              <div data-tauri-drag-region className="mt-0.5 text-[9px] font-medium text-slate-500 truncate">
                {!fieldGenerationAvailable
                  ? fieldGenerationUnavailableText
                  : fieldContext.selectedText || fieldContext.prefix || fieldStatusText || fieldActionText}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isDetected && detectedContext && detectedDocName ? (
                <button
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={handleRegenerateDraft}
                  disabled={isWorking}
                  className="h-7 px-2 flex items-center justify-center bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 text-[11px] font-medium"
                  title="生成全文"
                  aria-label="生成全文"
                >
                  <FileTextOutlined className="mr-1 text-xs" />
                  生成全文
                </button>
              ) : null}
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleToggleVoiceRecording}
                disabled={isWorking}
                className={[
                  'h-7 px-2 flex items-center justify-center border text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
                  voiceRecording
                    ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                    : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                ].join(' ')}
                title={voiceRecording ? '停止语音转写' : '语音输入'}
                aria-label={voiceRecording ? '停止语音转写' : '语音输入'}
              >
                <AudioOutlined className={voiceRecording ? 'mr-1 text-xs animate-pulse' : 'mr-1 text-xs'} />
                {voiceRecording ? '语音中' : '语音'}
              </button>
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleCollapseToBubble}
                className="w-7 h-7 flex items-center justify-center bg-white border border-emerald-200 text-slate-500 hover:bg-slate-50"
                title="收起为气泡"
                aria-label="收起为气泡"
              >
                <MinusOutlined className="text-xs" />
              </button>
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleExpand}
                className="w-7 h-7 flex items-center justify-center bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                title="打开字段详情"
                aria-label="打开字段详情"
              >
                <ArrowRightOutlined className="text-xs" />
              </button>
            </div>
          </div>
        </div>

        {hasSuggestionIntent ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-1.5">
              {suggestionStatus === 'loading' ? (
                <div className="h-full min-h-[90px] flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <Loading3QuartersOutlined className="animate-spin" />
                  正在加载候选
                </div>
              ) : suggestionStatus === 'error' ? (
                <div className="h-full min-h-[90px] flex items-center justify-center px-3 text-center text-[11px] text-red-500">
                  {suggestionErrorText || '候选加载失败'}
                </div>
              ) : fieldSuggestions.length > 0 ? (
                fieldSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    data-tauri-drag-region="false"
                    onClick={(event) => handleApplyFieldSuggestion(event, suggestion)}
                    className={[
                      'w-full min-h-[34px] px-2.5 py-1.5 text-left border text-[11px] leading-[1.45]',
                      'bg-white hover:bg-emerald-50 transition-colors',
                      copiedSuggestionId === suggestion.id && copyStatus === 'copied'
                        ? 'border-emerald-500 text-emerald-800'
                        : 'border-slate-200 text-slate-700',
                    ].join(' ')}
                    title="回填候选到当前字段"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <UploadOutlined className="text-[10px] text-emerald-600" />
                      <span>{suggestion.text}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="h-full min-h-[90px] flex items-center justify-center text-[11px] text-slate-400">
                  暂无合适候选
                </div>
              )}
            </div>
            <div className="px-2.5 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleRefreshSuggestions}
                disabled={suggestionStatus === 'loading'}
                className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold"
                title="换一批候选"
              >
                <ReloadOutlined className="text-[10px]" />
                换一批
              </button>
              {currentFieldDraft && fieldDraftStatus === 'ready' ? (
                <button
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={handleApplyFieldDraft}
                  className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[11px] font-bold"
                  title="回填已有草稿"
                >
                  <UploadOutlined className="text-[10px]" />
                  草稿
                </button>
              ) : null}
            </div>
            {voiceDraftPanel}
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                  {isFieldBusy ? <EditOutlined className="text-sm animate-pen-writing" /> : <FileTextOutlined className="text-sm" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-slate-800 truncate">
                    {fieldContext.fieldLabel}
                  </div>
                  <div className="mt-0.5 text-[9px] text-slate-500 truncate">
                    {fieldContext.patientName} · {fieldContext.docName}
                  </div>
                </div>
              </div>
              {(fieldDraftStatus === 'ready' || fieldDraftStatus === 'written') && fieldDraft?.generatedText ? (
                <div className="text-[11px] leading-[1.6] text-slate-700 whitespace-pre-wrap break-all">
                  <EvidenceCitationText text={fieldDraft.generatedText} evidenceSummary={fieldDraft.response.evidenceSummary} />
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  {fieldStatusText || '等待当前字段'}
                </div>
              )}
            </div>
            <div className="px-2.5 py-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleRegenerateField}
                disabled={isFieldBusy || !fieldGenerationAvailable}
                className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 text-[11px] font-bold"
                title={fieldGenerationAvailable
                  ? '重新生成当前字段'
                  : fieldGenerationUnavailableText}
              >
                <ReloadOutlined className="text-[10px]" />
                重新生成
              </button>
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={handleApplyFieldDraft}
                disabled={!canApplyField || isFieldBusy}
                className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-[11px] font-bold"
                title="回填当前字段"
              >
                <UploadOutlined className="text-[10px]" />
                回填
              </button>
            </div>
            {voiceDraftPanel}
          </>
        )}
      </div>
    );
  }

  if (editContext) {
    return (
      <div
        data-tauri-drag-region
        className={[
          'w-full h-full bg-white border border-emerald-500 shadow-xl overflow-hidden',
          'flex flex-col text-left',
        ].join(' ')}
        style={{ cursor: 'move' }}
      >
        <div data-tauri-drag-region className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
          <div data-tauri-drag-region className="flex items-start justify-between gap-2">
            <div data-tauri-drag-region className="min-w-0">
              <div data-tauri-drag-region className="text-[11px] font-bold text-emerald-700 truncate">
                {editContext.fieldLabel} · {getEditAssistModeLabel(editContext)}
              </div>
              <div data-tauri-drag-region className="mt-0.5 text-[9px] font-medium text-slate-500 truncate">
                {editContext.selectedText || editContext.prefix}
              </div>
            </div>
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={handleExpand}
              className="w-7 h-7 shrink-0 flex items-center justify-center bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              title="打开完整助手"
              aria-label="打开完整助手"
            >
              <ArrowRightOutlined className="text-xs" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-1.5">
          {suggestionStatus === 'loading' ? (
            <div className="h-full min-h-[90px] flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Loading3QuartersOutlined className="animate-spin" />
              正在加载候选
            </div>
          ) : suggestionStatus === 'error' ? (
            <div className="h-full min-h-[90px] flex items-center justify-center px-3 text-center text-[11px] text-red-500">
              {suggestionErrorText || '候选加载失败'}
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                data-tauri-drag-region="false"
                onClick={(event) => handleCopySuggestion(event, suggestion)}
                className={[
                  'w-full min-h-[34px] px-2.5 py-1.5 text-left border text-[11px] leading-[1.45]',
                  'bg-white hover:bg-emerald-50 transition-colors',
                  copiedSuggestionId === suggestion.id && copyStatus === 'copied'
                    ? 'border-emerald-500 text-emerald-800'
                    : 'border-slate-200 text-slate-700',
                ].join(' ')}
                title="复制候选"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CopyOutlined className="text-[10px] text-emerald-600" />
                  <span>{suggestion.text}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="h-full min-h-[90px] flex items-center justify-center text-[11px] text-slate-400">
              暂无合适候选
            </div>
          )}
        </div>

        <div className="px-2.5 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <span
            className={[
              'text-[10px] font-medium truncate',
              copyStatus === 'copied' ? 'text-emerald-700' : copyStatus === 'error' ? 'text-red-600' : 'text-slate-500',
            ].join(' ')}
          >
            {copyStatus === 'copied'
              ? '已复制，可粘贴到当前字段'
              : copyStatus === 'error'
                ? '复制失败，请重试'
                : '点击候选复制'}
          </span>
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={handleRefreshSuggestions}
            disabled={suggestionStatus === 'loading'}
            className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold"
            title="换一批候选"
          >
            <ReloadOutlined className="text-[10px]" />
            换一批
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-tauri-drag-region
      onDoubleClick={handleExpand}
      onKeyDown={handleShellKeyDown}
      className={[
        'relative flex items-center gap-2 px-2.5 py-2 w-full h-full overflow-hidden',
        'bg-white border shadow-lg',
        'hover:shadow-xl transition-shadow duration-200',
        'outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        isDetected
          ? 'border-emerald-500 focus-visible:ring-emerald-400'
          : 'border-[#1E3A8A] focus-visible:ring-[#1E3A8A]',
      ].join(' ')}
      style={{ cursor: 'move' }}
    >
      {/* 图标 */}
      <div
        data-tauri-drag-region
        className={[
          'relative flex items-center justify-center w-8 h-8 shrink-0 rounded-md',
          isDetected ? 'bg-emerald-50' : 'bg-[#F0F5FF]',
        ].join(' ')}
      >
        {isDetected ? (
          isWorking ? (
            <Loading3QuartersOutlined className="text-base text-emerald-600 animate-spin" />
          ) : draftStatus === 'written' ? (
            <CheckCircleOutlined className="text-base text-emerald-600" />
          ) : (
            <FileTextOutlined className="text-base text-emerald-600" />
          )
        ) : (
          <img src={appIcon} alt="" className="w-5 h-5 object-contain" draggable={false} />
        )}
        {/* 状态点 */}
        <span
          data-tauri-drag-region
          className={[
            'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm',
            isDetected ? 'bg-emerald-500' : 'bg-[#1E3A8A]',
          ].join(' ')}
        />
      </div>

      {/* 文字 */}
      <div data-tauri-drag-region className="flex-1 min-w-0 text-left">
        {isDetected && detectedContext ? (
          <>
            <div data-tauri-drag-region className="flex items-center justify-between gap-2">
              <div data-tauri-drag-region className="text-[11px] font-bold text-emerald-700 truncate">
                {detectedContext.patientName} · {draftStatusLabel}
              </div>
              {/* <div data-tauri-drag-region className="text-[9px] tabular-nums font-bold text-emerald-600">
                {Math.round(progress)}%
              </div> */}
            </div>
            <div data-tauri-drag-region className="mt-0.5 text-[11px] font-bold text-slate-700 truncate">
              {statusText || `双击进入${detectedContext.docName}`}
            </div>
          </>
        ) : (
          <>
            <div data-tauri-drag-region className="flex items-center gap-1 text-[11px] font-bold text-[#1E3A8A]">
              <SearchOutlined className="text-sm" />
              病历助手
            </div>
            <div data-tauri-drag-region className="mt-0.5 text-[9px] font-medium text-slate-500 truncate">
              {emrDebug
                ? formatEmrContextDebugLabel(emrDebug)
                : '等待病历系统文书'}
            </div>
          </>
        )}
      </div>

      {/* 操作图标 */}
      <div className="flex items-center gap-1 shrink-0">
        {isDetected && detectedContext && !isWorking ? (
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={handleRegenerateDraft}
            className="w-7 h-7 flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
            title={draftStatus === 'ready' || draftStatus === 'error' ? '重新生成出院记录' : '生成出院记录'}
            aria-label={draftStatus === 'ready' || draftStatus === 'error' ? '重新生成出院记录' : '生成出院记录'}
          >
            <ReloadOutlined className="text-xs" />
          </button>
        ) : null}
        <div
          className={[
            'flex items-center justify-center w-7 h-7',
            'transition-transform hover:scale-110',
            isDetected ? 'bg-emerald-600 text-white' : 'bg-[#1E3A8A] text-white',
          ].join(' ')}
        >
          {canWriteback ? (
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={handleWriteback}
              className="w-full h-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
              title="回写出院记录"
              aria-label="回写出院记录"
            >
              <UploadOutlined className="text-xs" />
            </button>
          ) : (
            <ArrowRightOutlined className="text-xs" />
          )}
        </div>
      </div>
      {isDetected ? (
        <div data-tauri-drag-region className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-100">
          <div
            data-tauri-drag-region
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <div data-tauri-drag-region className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1E3A8A]/20" />
      )}
    </div>
  );
}
