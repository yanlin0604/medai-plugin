import { CheckOutlined, LockOutlined, ThunderboltOutlined } from '@ant-design/icons';

interface Props {
  label: string;
  onWriteback: () => void;
  /** 已提交锁定态 */
  locked?: boolean;
  disabled?: boolean;
  /** 解锁回调（锁定态点击） */
  onUnlock?: () => void;
}

/**
 * 底部成稿提交面板（全范式通用，F8 快捷键入口）。
 * 将插件侧生成的成稿提交（回写）至宿主病历系统对应字段；插件不渲染目标表单。
 */
export default function WritebackBar({ label, onWriteback, locked, disabled, onUnlock }: Props) {
  return (
    <footer className="px-5 py-4 border-t border-slate-200 bg-white shrink-0">
      {locked ? (
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
