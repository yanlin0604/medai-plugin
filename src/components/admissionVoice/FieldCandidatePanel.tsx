import { CheckOutlined, CloseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { AdmissionCandidate } from '../../services/admissionVoice/types';

interface Props {
  candidates: Record<string, AdmissionCandidate>;
  safeCount: number;
  disabled?: boolean;
  onAccept: (fieldKey: string) => void;
  onIgnore: (fieldKey: string) => void;
  onAcceptAllSafe: () => void;
}

export default function FieldCandidatePanel({
  candidates,
  safeCount,
  disabled,
  onAccept,
  onIgnore,
  onAcceptAllSafe,
}: Props) {
  const items = Object.values(candidates);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <div className="text-[11px] font-extrabold text-slate-700">入院问询候选</div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">主诉、现病史、既往史、个人史、家族史</div>
        </div>
        <button
          type="button"
          disabled={disabled || safeCount === 0}
          onClick={onAcceptAllSafe}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-[#1E3A8A] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="只采纳未冲突且当前字段为空的候选"
        >
          <ThunderboltOutlined />
          采纳无冲突({safeCount})
        </button>
      </div>
      <div className="space-y-2 p-2">
        {items.length ? (
          items.map((candidate) => (
            <CandidateRow
              key={candidate.key}
              candidate={candidate}
              disabled={disabled}
              onAccept={onAccept}
              onIgnore={onIgnore}
            />
          ))
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">final 转写片段分析后会在这里显示字段候选</div>
        )}
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  disabled,
  onAccept,
  onIgnore,
}: {
  candidate: AdmissionCandidate;
  disabled?: boolean;
  onAccept: (fieldKey: string) => void;
  onIgnore: (fieldKey: string) => void;
}) {
  return (
    <article className={`rounded-md border px-2.5 py-2 ${statusClassName(candidate.status)}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold text-slate-800">{candidate.label}</span>
        <span className="text-[10px] font-semibold text-slate-500">{candidateStatusLabel(candidate)}</span>
      </div>
      <p className="break-words text-xs leading-5 text-slate-700">{candidate.value}</p>
      {candidate.sourceText ? (
        <p className="mt-1 break-words text-[10px] leading-4 text-slate-400">来源：{candidate.sourceText}</p>
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
}

function statusClassName(status: AdmissionCandidate['status']): string {
  switch (status) {
    case 'accepted':
      return 'border-emerald-100 bg-emerald-50';
    case 'ignored':
      return 'border-slate-100 bg-slate-50 opacity-70';
    case 'conflict':
      return 'border-amber-200 bg-amber-50';
    default:
      return 'border-slate-100 bg-slate-50';
  }
}

function candidateStatusLabel(candidate: AdmissionCandidate): string {
  switch (candidate.status) {
    case 'accepted':
      return '已采纳';
    case 'ignored':
      return '已忽略';
    case 'conflict':
      return '需医生确认替换';
    default:
      return '待确认';
  }
}
