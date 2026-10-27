import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AudioOutlined,
  CheckOutlined,
  ClearOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type {
  AdmissionCandidateState,
  AdmissionTranscriptSegment,
} from '../../services/admissionVoice/types';

export type AdmissionVoiceInputMode = 'smart' | 'dictation';

interface Props {
  status: 'idle' | 'connecting' | 'recording';
  disabled?: boolean;
  mode: AdmissionVoiceInputMode;
  activeSectionLabel?: string;
  partialText: string;
  segments: AdmissionTranscriptSegment[];
  candidates: AdmissionCandidateState;
  onAcceptPatient: (fieldKey: string) => void;
  onIgnorePatient: (fieldKey: string) => void;
  onModeChange: (mode: AdmissionVoiceInputMode) => void;
  onStart: (options: { useFieldExtraction: boolean; restartAnalysis?: boolean }) => Promise<void>;
  onStop: () => void;
  onEnd: () => void;
  onClearTranscripts: () => void;
  onClearFields: () => void;
}

export default function AdmissionVoiceTray({
  status,
  disabled,
  mode,
  partialText,
  segments,
  candidates,
  onAcceptPatient,
  onIgnorePatient,
  onModeChange,
  onStart,
  onStop,
  onEnd,
  onClearTranscripts,
  onClearFields,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [voiceFloating, setVoiceFloating] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState({ right: 16, bottom: 16 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);
  const recording = status === 'recording';
  const connecting = status === 'connecting';
  const patientCandidates = Object.values(candidates.patientFields).filter((candidate) => candidate.status === 'pending' || candidate.status === 'conflict');

  const startWithMode = (nextMode: AdmissionVoiceInputMode) => {
    onModeChange(nextMode);
    setVoiceFloating(true);
    void onStart({
      useFieldExtraction: nextMode === 'smart',
      restartAnalysis: nextMode === 'smart',
    });
  };

  useEffect(() => {
    if (disabled) setVoiceFloating(false);
  }, [disabled]);

  const handleFloatingPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: floatingPosition.right,
      startBottom: floatingPosition.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFloatingPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = 300;
    const height = 52;
    setFloatingPosition({
      right: Math.max(8, Math.min(window.innerWidth - width - 8, drag.startRight + drag.startX - event.clientX)),
      bottom: Math.max(8, Math.min(window.innerHeight - height - 8, drag.startBottom + drag.startY - event.clientY)),
    });
  };

  const handleFloatingPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <>
      {!voiceFloating ? (
        <section className="border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mx-auto flex min-h-[68px] max-w-[980px] items-center justify-center gap-3 px-4 py-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => startWithMode('smart')}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    mode === 'smart'
                      ? 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#172554]'
                      : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                  title="智能语音录入：识别内容并自动填入病历字段"
                >
                  <PlayCircleOutlined />
                  <span className="max-[419px]:hidden">智能语音录入</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => startWithMode('dictation')}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    mode === 'dictation'
                      ? 'bg-[#0F766E] text-white shadow-sm hover:bg-[#115E59]'
                      : 'border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                  }`}
                  title="语音录入：将识别内容写入当前病历字段"
                >
                  <AudioOutlined />
                  <span>语音录入</span>
                </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onClearFields}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="清空所有病历字段"
            >
              <ClearOutlined />
              <span>清空字段</span>
            </button>
          </div>
        </section>
      ) : null}

      {voiceFloating ? (
        <div
          className="fixed z-[65] flex h-12 select-none items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.2)] backdrop-blur-xl"
          style={{ right: floatingPosition.right, bottom: floatingPosition.bottom, touchAction: 'none' }}
          onPointerDown={handleFloatingPointerDown}
          onPointerMove={handleFloatingPointerMove}
          onPointerUp={handleFloatingPointerUp}
          onPointerCancel={handleFloatingPointerUp}
          title="拖动悬浮条"
        >
          <span className={`mx-1 h-2 w-2 rounded-full ${recording ? 'animate-pulse bg-rose-500' : 'bg-slate-300'}`} />
          <span className="min-w-[56px] text-xs font-bold text-slate-700">{recording || connecting ? (mode === 'smart' ? '对话中' : '录入中') : '已暂停'}</span>
          <button
            type="button"
            onClick={() => {
              if (recording || connecting) onStop();
              else void onStart({ useFieldExtraction: mode === 'smart' });
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            title={recording || connecting ? '暂停对话' : '继续对话'}
            aria-label={recording || connecting ? '暂停对话' : '继续对话'}
          >
            {recording || connecting ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
            title="查看对话详情"
            aria-label="查看对话详情"
          >
            <InfoCircleOutlined />
          </button>
          <button
            type="button"
            onClick={() => {
              onEnd();
              onClearTranscripts();
              setDetailsOpen(false);
              setVoiceFloating(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="结束对话"
            aria-label="结束对话"
          >
            <CloseOutlined />
          </button>
        </div>
      ) : null}

      {detailsOpen ? (
        <div
          className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center bg-transparent p-3 pb-20"
          role="presentation"
        >
          <section
            className="pointer-events-auto flex max-h-[min(680px,80vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-[4px] bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admission-voice-details-title"
          >
            <header className="flex min-h-[56px] items-start justify-between border-b border-slate-200 bg-white px-4 py-2.5">
              <div>
                <h2 id="admission-voice-details-title" className="text-base font-bold leading-6 text-slate-800">会话详情</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">本次入院记录语音识别内容</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="关闭详情"
                aria-label="关闭详情"
              >
                <CloseOutlined />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-white px-3 py-2 sm:px-4">
              {patientCandidates.length ? (
                <div className="mb-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="mb-1.5 text-xs font-bold text-amber-800">待确认患者信息</div>
                  <div className="space-y-1.5">
                    {patientCandidates.map((candidate) => (
                      <div key={candidate.key} className="flex items-center justify-between gap-3 rounded bg-white px-2.5 py-1.5">
                        <div className="min-w-0 text-xs"><span className="font-bold text-slate-700">{candidate.label}</span><span className="ml-2 break-words text-slate-600">{candidate.value}</span></div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => onAcceptPatient(candidate.key)} className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700" title="采纳"><CheckOutlined /></button>
                          <button type="button" onClick={() => onIgnorePatient(candidate.key)} className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200" title="忽略"><CloseOutlined /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {segments.map((segment) => {
                const palette = getSpeakerPalette(segment.speaker);
                return (
                <div key={segment.id} className="flex items-start gap-1 py-0">
                  <div className="flex w-[48px] shrink-0 items-center pt-1.5">
                    <span className="truncate text-xs font-semibold text-slate-600">{displaySpeaker(segment.speaker)}</span>
                  </div>
                  <div className="relative min-w-0 max-w-[calc(100%-53px)] rounded-[3px] px-2 py-1 text-[13px] leading-5 shadow-sm" style={{ backgroundColor: palette.background, color: palette.text }}>
                    <span className="absolute left-[-5px] top-[7px] h-0 w-0 border-y-[5px] border-y-transparent border-r-[5px]" style={{ borderRightColor: palette.background }} />
                    <p className="break-words">{segment.text}</p>
                  </div>
                </div>
                );
              })}
              {partialText ? (
                <div className="flex items-start gap-1 py-0">
                  <div className="flex w-[48px] shrink-0 items-center pt-1.5">
                    <span className="truncate text-xs font-semibold text-slate-600">未知</span>
                  </div>
                  <div className="relative min-w-0 max-w-[calc(100%-53px)] rounded-[3px] px-2 py-1 text-[13px] leading-5 text-slate-700 shadow-sm" style={{ backgroundColor: getSpeakerPalette('未知').background }}>
                    <span className="absolute left-[-5px] top-[7px] h-0 w-0 border-y-[5px] border-y-transparent border-r-[5px] border-r-[#cfe8fb]" />
                    <p className="break-words">{partialText}</p>
                  </div>
                </div>
              ) : null}
              {!segments.length && !partialText ? <div className="py-12 text-center text-sm text-slate-400">暂无语音内容</div> : null}
            </div>
            <footer className="flex justify-end border-t border-slate-200 bg-white px-4 py-2.5">
              <button type="button" onClick={() => setDetailsOpen(false)} className="h-8 rounded-md border border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100">关闭</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function isUnknownSpeaker(speaker: string) {
  return !speaker || speaker === '未知' || speaker === 'unknown';
}

function displaySpeaker(speaker: string) {
  return isUnknownSpeaker(speaker) ? '未知' : speaker;
}

const SPEAKER_PALETTE = [
  { background: '#d8efd7', text: '#334e36' },
  { background: '#d9e9fb', text: '#2f4968' },
  { background: '#f8e2c9', text: '#6b4930' },
  { background: '#eadcf5', text: '#5a3f6d' },
];

function getSpeakerPalette(speaker: string) {
  if (isUnknownSpeaker(speaker)) return { background: '#cfe8fb', text: '#334e68' };
  let hash = 0;
  for (let index = 0; index < speaker.length; index += 1) hash = (hash * 31 + speaker.charCodeAt(index)) >>> 0;
  return SPEAKER_PALETTE[hash % SPEAKER_PALETTE.length];
}
