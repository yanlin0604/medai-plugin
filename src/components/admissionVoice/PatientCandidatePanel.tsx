import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { AdmissionCandidate, TempPatientInfo } from '../../services/admissionVoice/types';

interface Props {
  candidates: Record<string, AdmissionCandidate>;
  tempPatientInfo: TempPatientInfo;
  disabled?: boolean;
  onAccept: (fieldKey: string) => void;
  onIgnore: (fieldKey: string) => void;
}

export default function PatientCandidatePanel({
  candidates,
  tempPatientInfo,
  disabled,
  onAccept,
  onIgnore,
}: Props) {
  const items = Object.values(candidates);
  if (!items.length) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-[11px] font-extrabold text-slate-700">待建档患者信息</span>
        <span className="text-[10px] font-semibold text-amber-600">采纳后仍需绑定/建档</span>
      </div>
      <div className="space-y-2 p-2">
        {items.map((candidate) => {
          const acceptedValue = tempPatientInfo[candidate.key as keyof TempPatientInfo];
          return (
            <article key={candidate.key} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-slate-800">{candidate.label}</span>
                <span className="text-[10px] font-semibold text-slate-400">{candidateStatusLabel(candidate)}</span>
              </div>
              <p className="break-words text-xs leading-5 text-slate-700">{candidate.value}</p>
              {acceptedValue ? (
                <p className="mt-1 text-[10px] text-emerald-600">临时信息：{acceptedValue}</p>
              ) : null}
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  disabled={disabled || candidate.status === 'accepted'}
                  onClick={() => onAccept(candidate.key)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#1E3A8A] px-2 text-[11px] font-bold text-white hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckOutlined />
                  采纳
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onIgnore(candidate.key)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CloseOutlined />
                  忽略
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function candidateStatusLabel(candidate: AdmissionCandidate): string {
  switch (candidate.status) {
    case 'accepted':
      return '已采纳';
    case 'ignored':
      return '已忽略';
    case 'conflict':
      return '新候选';
    default:
      return '待确认';
  }
}
