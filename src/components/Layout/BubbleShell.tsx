import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  FileTextOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import appIcon from '../../../src-tauri/icons/app-icon-64.png';
import { collapseAssistantWindow, expandAssistantWindow, showAssistBubbleWindow } from '../../services/windowMode';
import { BubbleEmrContext, useBubbleStore, getBubbleContextKey } from '../../stores/useBubbleStore';
import { usePatientStore } from '../../stores/usePatientStore';
import { watchEmrContext } from '../../services/emrContext/watchEmrContext';
import { activateEmrContext, buildPatientFromEmrContext } from '../../services/emrContext/activateEmrContext';
import { buildDischargeCase } from '../../services/samples/discharge';
import { submitDocument } from '../../services/emsBridge';
import {
  buildEditAssistSuggestions,
  copyEditAssistSuggestion,
  getEditAssistModeLabel,
  getLatestBsEditAssistContext,
  isUsableEditAssistContext,
  type BsEditAssistContext,
  type EditAssistSuggestion,
} from '../../services/editAssistService';

interface BubbleShellProps {
  onExpand?: (context: BubbleEmrContext | null) => void;
}

type BubbleDraftStatus = 'idle' | 'generating' | 'ready' | 'writing' | 'written' | 'error';
type CopyStatus = 'idle' | 'copied' | 'error';

const GENERATION_STEPS = [
  '拉取入院记录',
  '整理诊疗经过',
  '校验出院诊断',
  '生成出院医嘱',
];

export default function BubbleShell({ onExpand }: BubbleShellProps) {
  const navigate = useNavigate();
  const { mode, detectedContext, expand, setDetectedContext, markActivated, hasActivated } = useBubbleStore();
  const { selectPatient, selectDoc } = usePatientStore();
  const isDetected = mode === 'detected' && Boolean(detectedContext);
  const contextKey = detectedContext ? getBubbleContextKey(detectedContext) : '';
  const [draftStatus, setDraftStatus] = useState<BubbleDraftStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [editContext, setEditContext] = useState<BsEditAssistContext | null>(null);
  const [suggestionBatch, setSuggestionBatch] = useState(0);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copiedSuggestionId, setCopiedSuggestionId] = useState('');
  const generatedPatient = useMemo(
    () => (detectedContext ? buildPatientFromEmrContext(detectedContext) : null),
    [contextKey],
  );
  const generatedDraft = useMemo(
    () => (generatedPatient && detectedContext ? buildBubbleDischargeDraft(generatedPatient, detectedContext.docName) : null),
    [generatedPatient, detectedContext?.docName],
  );
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
  const suggestions = useMemo(
    () => (editContext ? buildEditAssistSuggestions(editContext, suggestionBatch) : []),
    [editContext, suggestionBatch],
  );

  // 监听 EMR 上下文变化，只更新气泡状态，不自动展开
  useEffect(() => {
    const cleanup = watchEmrContext((context) => {
      setDetectedContext(context);
    });

    return cleanup;
  }, [setDetectedContext]);

  useEffect(() => {
    let disposed = false;

    const pollEditContext = async () => {
      const context = await getLatestBsEditAssistContext();
      if (disposed) return;
      setEditContext(isUsableEditAssistContext(context) ? context : null);
    };

    void pollEditContext();
    const timer = window.setInterval(() => {
      void pollEditContext();
    }, 700);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setSuggestionBatch(0);
    setCopyStatus('idle');
    setCopiedSuggestionId('');
  }, [editContextKey]);

  useEffect(() => {
    if (editContext) {
      void showAssistBubbleWindow();
      return;
    }
    void collapseAssistantWindow();
  }, [editContext]);

  useEffect(() => {
    if (!isDetected || !detectedContext) {
      setDraftStatus('idle');
      setProgress(0);
      setStatusText('');
      return;
    }

    setDraftStatus('generating');
    setProgress(8);
    setStatusText(GENERATION_STEPS[0]);

    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      const nextProgress = Math.min(100, 8 + tick * 9);
      const stepIndex = Math.min(
        GENERATION_STEPS.length - 1,
        Math.floor((nextProgress / 100) * GENERATION_STEPS.length),
      );
      setProgress(nextProgress);
      setStatusText(nextProgress >= 100 ? '出院记录已生成' : GENERATION_STEPS[stepIndex]);
      if (nextProgress >= 100) {
        window.clearInterval(timer);
        setDraftStatus('ready');
      }
    }, 260);

    return () => window.clearInterval(timer);
  }, [contextKey, detectedContext, isDetected]);

  const handleExpand = () => {
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

  const handleWriteback = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!detectedContext || !generatedDraft || draftStatus === 'writing') return;

    setDraftStatus('writing');
    setStatusText('正在回写病历系统');
    setProgress(100);

    const result = await submitDocument(generatedDraft);
    if (result.ok) {
      setDraftStatus('written');
      setStatusText('已回写到出院记录');
      return;
    }

    setDraftStatus('error');
    setStatusText('回写失败，点开处理');
  };

  const handleRefreshSuggestions = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSuggestionBatch((value) => value + 1);
    setCopyStatus('idle');
    setCopiedSuggestionId('');
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

  const canWriteback = draftStatus === 'ready' || draftStatus === 'error';
  const isWorking = draftStatus === 'generating' || draftStatus === 'writing';

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
          {suggestions.length > 0 ? (
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
            className="h-7 px-2.5 shrink-0 inline-flex items-center gap-1 bg-slate-900 text-white hover:bg-slate-700 text-[11px] font-bold"
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
      onClick={handleExpand}
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
                {detectedContext.patientName} · {draftStatus === 'written' ? '已回写' : draftStatus === 'ready' ? '可回写' : '生成中'}
              </div>
              <div data-tauri-drag-region className="text-[9px] tabular-nums font-bold text-emerald-600">
                {Math.round(progress)}%
              </div>
            </div>
            <div data-tauri-drag-region className="mt-0.5 text-[9px] font-medium text-slate-500 truncate">
              {statusText || '准备生成出院记录'}
            </div>
          </>
        ) : (
          <>
            <div data-tauri-drag-region className="flex items-center gap-1 text-[11px] font-bold text-[#1E3A8A]">
              <SearchOutlined className="text-sm" />
              病历助手
            </div>
            <div data-tauri-drag-region className="mt-0.5 text-[9px] font-medium text-slate-500 truncate">
              等待病历系统文书
            </div>
          </>
        )}
      </div>

      {/* 箭头图标 */}
      <div
        className={[
          'flex items-center justify-center w-7 h-7 shrink-0',
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

function buildBubbleDischargeDraft(patient: ReturnType<typeof buildPatientFromEmrContext>, docName: string) {
  const dischargeCase = buildDischargeCase(patient);
  const mapping: Record<string, string> = {
    入院日期: 'admissionDate',
    出院日期: 'dischargeDate',
    住院天数: 'hospitalDays',
    入院情况: 'admissionCondition',
    入院诊断: 'admissionDiagnosis',
    诊疗经过: 'treatmentCourse',
    出院诊断: 'dischargeDiagnosis',
    出院情况: 'dischargeCondition',
    出院医嘱: 'dischargeOrders',
  };
  const fields = Object.fromEntries(
    dischargeCase.sections.map((section) => [mapping[section.section] ?? section.section, section.text]),
  );
  fields.patientInfo = `姓名：${patient.name}；性别：${patient.gender}；年龄：${patient.age}；床号：${patient.bedNo}；住院号：${patient.id}；科室：${patient.deptName}；入院日期：${patient.admissionDate}；主管医生：${patient.doctor}；诊断：${patient.diagnosis}`;
  fields.physicianSignature = patient.doctor;

  return {
    docCode: 'DOC010',
    docName,
    patientId: patient.id,
    fields,
    fieldOrder: [
      'patientInfo',
      'admissionDate',
      'dischargeDate',
      'hospitalDays',
      'admissionCondition',
      'admissionDiagnosis',
      'treatmentCourse',
      'dischargeDiagnosis',
      'dischargeCondition',
      'dischargeOrders',
      'physicianSignature',
    ],
    content: dischargeCase.sections.map((section) => `【${section.section}】${section.text}`).join('\n'),
  };
}
