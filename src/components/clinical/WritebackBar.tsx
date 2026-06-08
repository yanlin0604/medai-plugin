import { CheckOutlined, LockOutlined, ThunderboltOutlined } from '@ant-design/icons';

interface Props {
  label: string;
  onWriteback: () => void;
  /** 已提交锁定态 */
  locked?: boolean;
  disabled?: boolean;
  /** 提交中的流式反馈态 */
  busy?: boolean;
  busyText?: string;
  progress?: number;
  /** 解锁回调（锁定态点击） */
  onUnlock?: () => void;
}

/**
 * 底部成稿提交面板（全范式通用）。
 * 将插件侧生成的成稿提交（回写）至宿主病历系统对应字段；插件不渲染目标表单。
 */
export default function WritebackBar({
  label,
  onWriteback,
  locked,
  disabled,
  busy,
  busyText,
  progress = 0,
  onUnlock,
}: Props) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <footer className="px-5 py-4 border-t border-slate-200 bg-white shrink-0">
      {busy ? (
        <button
          disabled
          className="relative w-full overflow-hidden bg-emerald-600 text-white font-semibold py-3 rounded-[10px] text-sm flex items-center justify-center gap-2 transition-all cursor-wait"
        >
          <LoadingPulse />
          <span className="min-w-[8.5em] text-left">
            {busyText || '正在提交'}
            <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 rounded-full bg-white/80 animate-pulse" />
          </span>
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-300/40">
            <span
              className="block h-full bg-white/90 transition-all duration-300"
              style={{ width: `${safeProgress}%` }}
            />
          </span>
        </button>
      ) : locked ? (
        <button
          onClick={onUnlock}
          className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 font-bold py-3 rounded-[10px] text-sm flex items-center justify-center gap-2 transition-all"
        >
          <LockOutlined />
          <span>已提交至病历系统（点击解锁重新编辑）</span>
        </button>
      ) : (
        <button
          onClick={onWriteback}
          disabled={disabled}
          className="w-full bg-[#1E3A8A] hover:bg-[#172554] text-white font-semibold py-3 rounded-[10px] text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabled ? <ThunderboltOutlined /> : <CheckOutlined />}
          <span>{label}</span>
        </button>
      )}
    </footer>
  );
}

function LoadingPulse() {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <span className="absolute h-4 w-4 rounded-full border-2 border-white/35" />
      <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-pulse" />
    </span>
  );
}
