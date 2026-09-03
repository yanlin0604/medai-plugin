import { useCallback, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpandOutlined, LoginOutlined } from '@ant-design/icons';
import { useBubbleStore } from '../../stores/useBubbleStore';
import { expandAssistantWindow } from '../../services/windowMode';

export default function LoginBubbleShell() {
  const navigate = useNavigate();
  const clearLoginCollapsed = useBubbleStore((state) => state.setLoginCollapsed);

  const handleExpand = useCallback(() => {
    clearLoginCollapsed(false);
    navigate('/login', { replace: true });
    void expandAssistantWindow();
  }, [clearLoginCollapsed, navigate]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleExpand();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-tauri-drag-region
      onDoubleClick={handleExpand}
      onKeyDown={handleKeyDown}
      className="relative flex h-full w-full items-center gap-3 overflow-hidden border border-slate-200 bg-white px-3 py-2 text-left shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-1"
      style={{ cursor: 'move' }}
      title="双击放大登录"
      aria-label="用户还未登录，请双击放大登录"
    >
      <div
        data-tauri-drag-region
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F0F5FF] text-[#1E3A8A]"
      >
        <LoginOutlined className="text-base" />
      </div>

      <div data-tauri-drag-region className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
            未登录
          </span>
          <span className="truncate text-[11px] font-bold text-slate-900">用户还未登录</span>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
          请双击放大登录
        </div>
      </div>

      <div
        data-tauri-drag-region
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400"
      >
        <ExpandOutlined className="text-xs" />
      </div>
    </div>
  );
}
