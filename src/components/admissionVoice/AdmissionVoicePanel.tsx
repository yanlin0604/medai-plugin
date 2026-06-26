import {
  AudioOutlined,
  ClearOutlined,
  StopOutlined,
} from '@ant-design/icons';
import FieldCandidatePanel from './FieldCandidatePanel';
import PatientCandidatePanel from './PatientCandidatePanel';
import TranscriptStream from './TranscriptStream';
import type {
  AdmissionCandidateState,
  AdmissionTranscriptSegment,
  PatientMode,
  TempPatientInfo,
} from '../../services/admissionVoice/types';

interface Props {
  status: 'idle' | 'connecting' | 'recording';
  disabled?: boolean;
  patientMode: PatientMode;
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

export default function AdmissionVoicePanel({
  status,
  disabled,
  patientMode,
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
  const canClear = Boolean(partialText || segments.length);

  return (
    <section className="mx-auto max-w-[980px] rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-[#1E3A8A]">入院问询语音</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
            <span>{voiceStatusText(status)}</span>
            <span className={analysisConnected ? 'text-emerald-600' : 'text-slate-400'}>
              {analysisConnected ? '实时分析已连接' : '实时分析未连接'}
            </span>
            {patientMode === 'new' ? <span className="text-amber-600">待建档患者</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
              开始问询
            </button>
          )}
          <button
            type="button"
            disabled={!canClear}
            onClick={onClearTranscripts}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ClearOutlined />
            清空转写
          </button>
        </div>
      </div>

      {(asrError || analysisError) ? (
        <div className="space-y-1 border-b border-slate-100 px-4 py-2 text-[11px] font-semibold">
          {asrError ? <div className="text-rose-600">{asrError}</div> : null}
          {analysisError ? <div className="text-amber-600">{analysisError}</div> : null}
        </div>
      ) : null}

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <TranscriptStream partialText={partialText} segments={segments} />
        <div className="space-y-3">
          {patientMode === 'new' ? (
            <PatientCandidatePanel
              candidates={candidates.patientFields}
              tempPatientInfo={tempPatientInfo}
              disabled={disabled}
              onAccept={onAcceptPatient}
              onIgnore={onIgnorePatient}
            />
          ) : null}
          <FieldCandidatePanel
            candidates={candidates.documentFields}
            safeCount={safeDocumentCandidateCount}
            disabled={disabled}
            onAccept={onAcceptDocument}
            onIgnore={onIgnoreDocument}
            onAcceptAllSafe={onAcceptAllSafe}
          />
        </div>
      </div>
    </section>
  );
}

function voiceStatusText(status: Props['status']): string {
  switch (status) {
    case 'connecting':
      return '正在连接麦克风与 ASR';
    case 'recording':
      return '正在听写';
    default:
      return '未开始';
  }
}
