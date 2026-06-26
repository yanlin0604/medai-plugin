import {
  AudioOutlined,
  CheckOutlined,
  ClearOutlined,
  CloseOutlined,
  Loading3QuartersOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
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
  activeSectionLabel?: string;
  partialText: string;
  segments: AdmissionTranscriptSegment[];
  candidates: AdmissionCandidateState;
  tempPatientInfo: TempPatientInfo;
  asrError?: string;
  analysisError?: string;
  analysisConnected?: boolean;
  onStart: () => Promise<void>;
  onStop: () => void;
  onClearTranscripts: () => void;
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
  asrError,
  analysisError,
  analysisConnected,
  onStart,
  onStop,
  onClearTranscripts,
  onAcceptPatient,
  onIgnorePatient,
}: Props) {
  const recording = status === 'recording';
  const connecting = status === 'connecting';
  const latestSegment = segments[segments.length - 1];
  const patientCandidates = Object.values(candidates.patientFields);

  return (
    <div className="border-t border-slate-200/50 bg-white/80 pb-4 pt-3 backdrop-blur-xl shadow-[0_-12px_40px_rgba(0,0,0,0.04)]">
      <div className="mx-auto max-w-[980px] px-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 shadow-sm shadow-blue-600/30">
               {recording ? (
                 <div className="absolute inset-0 rounded-full animate-ping bg-blue-600 opacity-20" />
               ) : null}
               <AudioOutlined className="text-white text-sm" />
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h3 className="text-sm font-bold text-slate-800">智能语音录入</h3>
                 {statusTag(status)}
                 {analysisConnected ? (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-inset ring-emerald-200/50">分析中</span>
                 ) : null}
               </div>
               <div className="text-[11px] font-medium text-slate-500">
                 当前段落：<span className="text-blue-600">{activeSectionLabel || '未选择'}</span>
               </div>
             </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Buttons */}
             {recording || connecting ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  {connecting ? <Loading3QuartersOutlined className="animate-spin" /> : <PauseCircleOutlined />}
                  {connecting ? '连接中' : '结束录音'}
                </button>
             ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onStart()}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-[#1E3A8A] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#172554] disabled:opacity-50 transition-colors"
                >
                  <PlayCircleOutlined />
                  开始语音
                </button>
             )}
             <button
               type="button"
               disabled={!partialText && !segments.length}
               onClick={onClearTranscripts}
               className="flex h-8 items-center justify-center w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40 transition-colors"
               title="清空"
             >
               <ClearOutlined />
             </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="mt-3 flex gap-3">
          <div className="flex-1 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-full blur-3xl opacity-30 -mr-10 -mt-10" />
             <div className="relative">
               <div className="text-[10px] font-bold text-slate-400 mb-1">
                 {partialText ? '正在倾听...' : latestSegment ? '最近识别' : '等待语音输入'}
               </div>
               <p className="text-xs leading-5 text-slate-700 font-medium min-h-[40px] line-clamp-2 break-words">
                 {partialText || latestSegment?.text || '点击开始语音后，请开始询问患者，内容将自动填充到对应字段。'}
               </p>
             </div>
          </div>
          
          {patientMode === 'new' && patientCandidates.length > 0 && (
             <div className="w-[320px] shrink-0">
               <div className="rounded-xl border border-slate-200/60 bg-white p-2 shadow-sm">
                 <div className="px-2 pt-1 pb-2 text-[10px] font-bold text-slate-500">待建档信息发现</div>
                 <div className="max-h-[72px] overflow-y-auto space-y-1.5 px-1 pb-1">
                    {patientCandidates.map(c => (
                      <div key={c.key} className="flex items-center justify-between rounded-lg bg-slate-50 p-1.5 pl-2">
                        <div className="min-w-0 flex-1">
                           <div className="flex items-center gap-1.5">
                             <span className="text-[11px] font-bold text-slate-800">{c.label}</span>
                             <span className="truncate text-[11px] text-blue-600">{c.value}</span>
                           </div>
                        </div>
                        <div className="flex shrink-0 gap-1 ml-2">
                          <button
                            disabled={disabled || c.status === 'accepted'}
                            onClick={() => onAcceptPatient(c.key)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                          ><CheckOutlined className="text-[10px]" /></button>
                          <button
                            disabled={disabled}
                            onClick={() => onIgnorePatient(c.key)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40"
                          ><CloseOutlined className="text-[10px]" /></button>
                        </div>
                      </div>
                    ))}
                 </div>
               </div>
             </div>
          )}
        </div>
        
        {/* Errors */}
        {(asrError || analysisError) && (
          <div className="mt-2 text-[11px] font-medium space-y-1">
             {asrError && <div className="text-rose-500 bg-rose-50 px-2 py-1 rounded border border-rose-100">{asrError}</div>}
             {analysisError && <div className="text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">{analysisError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function statusTag(status: string) {
  if (status === 'recording') {
    return <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 ring-1 ring-inset ring-blue-200/50"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />录音中</span>;
  }
  if (status === 'connecting') {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-inset ring-amber-200/50">连接中</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">就绪</span>;
}
