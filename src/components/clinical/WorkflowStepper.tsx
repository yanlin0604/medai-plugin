export interface StepDef {
  id: number;
  label: string;
}

interface Props {
  steps: StepDef[];
  current: number;
  onChange: (id: number) => void;
  /** 已解锁的最大步骤；超出则禁止跳转（缺省=全部可点，向后兼容） */
  maxReached?: number;
}

/**
 * 四步流工作引导条（范式三：语音采集→要素核对→诊断质控→草稿回写）。
 * 对应需求图3-4"四步流工作指引条(Stepper)"。
 * 传入 maxReached 时，未完成的后续步骤灰显且禁止点击（流程门禁，防止跳步）。
 */
export default function WorkflowStepper({ steps, current, onChange, maxReached }: Props) {
  return (
    <nav className="flex bg-[#F0F5FF] border-b border-[#1E3A8A]/10 px-3 py-2 justify-between text-[11px] shrink-0">
      {steps.map((s) => {
        const active = current === s.id;
        const reachable = maxReached == null || s.id <= maxReached;
        return (
          <button
            key={s.id}
            onClick={() => reachable && onChange(s.id)}
            disabled={!reachable}
            title={reachable ? undefined : '请先完成前序步骤'}
            className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${
              active
                ? 'text-[#1E3A8A] font-bold bg-white shadow-sm'
                : reachable
                ? 'text-slate-500 font-medium'
                : 'text-slate-300 font-medium cursor-not-allowed'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center text-[9px] font-bold ${
                active
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : reachable
                  ? 'border-slate-400 text-slate-400'
                  : 'border-slate-200 text-slate-300'
              }`}
            >
              {s.id}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
