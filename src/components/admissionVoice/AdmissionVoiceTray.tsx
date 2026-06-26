import {
  AudioOutlined,
  CheckOutlined,
  ClearOutlined,
  CloseOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type {
  AdmissionCandidate,
  AdmissionCandidateState,
  AdmissionTranscriptSegment,
  PatientMode,
  TempPatientInfo,
} from '../../services/admissionVoice/types';

interface Props {
  status: 'idle' | 'connecting' | 'recording';
  disabled?: boolean;
  patientMode: PatientMode;
  activeSectionLabel?: string;
  partialText: string;
  segments: AdmissionTranscriptSegment[];
  candidates: AdmissionCandidateState;
  safeDocumentCandidateCount: number;
  tempPatientInfo: TempPatientInfo;
  asrError?: string;
  analysisError?: string;
  analysisConnected?: boolean;
  onStart: () => Promise<void>;
  onStop: () => void;
  onClearTranscripts: () => void;
  onAcceptDocument: (fieldKey: string) => void;
  onIgnoreDocument: (fieldKey: string) => void;
  onAcceptAllSafe: () => void;
  onAcceptPatient: (fieldKey: string) => void;
  onIgnorePatient: (fieldKey: string) => void;
}

export default function AdmissionVoiceTray({
  status,
  disabled,
  patientMode,
  activeSectionLabel,
  partialText,
  segments,
  candidates,
  safeDocumentCandidateCount,
  tempPatientInfo,
  asrError,
  analysisError,
  analysisConnected,
  onStart,
  onStop,
  onClearTranscripts,
  onAcceptDocument,
  onIgnoreDocument,
  onAcceptAllSafe,
  onAcceptPatient,
  onIgnorePatient,
}: Props) {
  const recording = status === 'recording';
  const connecting = status === 'connecting';
  const latestSegment = segments[segments.length - 1];
  const documentCandidates = Object.values(candidates.documentFields);
  const patientCandidates = Object.values(candidates.patientFields);

  return (
    <div className="border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto max-w-[980px] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900">入院问询语音</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                {voiceStatusText(status)}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${analysisConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {analysisConnected ? '分析已连接' : '分析未连接'}
              </span>
              {patientMode === 'new' ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">待建档</span>
              ) : null}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
              当前段落：{activeSectionLabel || '未选择'}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {recording || connecting ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
              >
                <StopOutlined />
                停止
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onStart()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[#1E3A8A] px-3 text-xs font-bold text-white hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AudioOutlined />
                开始语音
              </button>
            )}
            <button
              type="button"
              disabled={!partialText && !segments.length}
              onClick={onClearTranscripts}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClearOutlined />
              清空
            </button>
            <button
              type="button"
              disabled={disabled || safeDocumentCandidateCount === 0}
              onClick={onAcceptAllSafe}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-bold text-[#1E3A8A] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckOutlined />
              采纳无冲突({safeDocumentCandidateCount})
            </button>
          </div>
        </div>

        {(asrError || analysisError) ? (
          <div className="mt-2 space-y-1 text-[11px] font-semibold">
            {asrError ? <div className="text-rose-600">{asrError}</div> : null}
            {analysisError ? <div className="text-amber-600">{analysisError}</div> : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="min-h-[74px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>转写</span>
              <span>{partialText ? '识别中' : latestSegment ? '最近片段' : '等待语音'}</span>
            </div>
            <p className="line-clamp-3 break-words text-xs leading-5 text-slate-700">
              {partialText || latestSegment?.text || '开始语音后，ASR 文本会显示在这里。'}
            </p>
          </div>

          <div className="space-y-2">
            <CompactCandidateList
              title="字段候选"
              emptyText="final 片段分析后出现字段候选"
              candidates={documentCandidates}
              disabled={disabled}
              onAccept={onAcceptDocument}
              onIgnore={onIgnoreDocument}
            />
            {patientMode === 'new' && patientCandidates.length ? (
              <CompactCandidateList
                title="待建档信息"
                emptyText=""
                candidates={patientCandidates}
                disabled={disabled}
                acceptedValues={tempPatientInfo as Record<string, string | undefined>}
                onAccept={onAcceptPatient}
                onIgnore={onIgnorePatient}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactCandidateList({
  title,
  emptyText,
  candidates,
  disabled,
  acceptedValues,
  onAccept,
  onIgnore,
}: {
  title: string;
  emptyText: string;
  candidates: AdmissionCandidate[];
  disabled?: boolean;
  acceptedValues?: Record<string, string | undefined>;
  onAccept: (fieldKey: string) => void;
  onIgnore: (fieldKey: string) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-500">{title}</div>
      <div className="max-h-40 overflow-y-auto p-2">
        {candidates.length ? (
          <div className="space-y-1.5">
            {candidates.map((candidate) => (
              <div key={candidate.key} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold text-slate-800">{candidate.label}</span>
                      <span className="text-[10px] font-bold text-slate-400">{candidateStatusLabel(candidate.status)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-4 text-slate-600">{candidate.value}</p>
                    {acceptedValues?.[candidate.key] ? (
                      <p className="mt-0.5 text-[10px] text-emerald-600">已录入：{acceptedValues[candidate.key]}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={disabled || candidate.status === 'accepted'}
                      onClick={() => onAccept(candidate.key)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#1E3A8A] text-white hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-40"
                      title="采纳"
                    >
                      <CheckOutlined />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onIgnore(candidate.key)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title="忽略"
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-slate-400">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function voiceStatusText(status: Props['status']): string {
  switch (status) {
    case 'connecting':
      return '连接中';
    case 'recording':
      return '听写中';
    default:
      return '未开始';
  }
}

function candidateStatusLabel(status: AdmissionCandidate['status']): string {
  switch (status) {
    case 'accepted':
      return '已采纳';
    case 'ignored':
      return '已忽略';
    case 'conflict':
      return '需确认';
    default:
      return '待确认';
  }
}
