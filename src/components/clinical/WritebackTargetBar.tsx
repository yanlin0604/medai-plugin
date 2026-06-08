import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingOutlined, LinkOutlined, DesktopOutlined, CopyOutlined, PlaySquareOutlined } from '@ant-design/icons';
import {
  getWritebackConfig,
  WRITEBACK_MODE_LABELS,
  WritebackConfig,
} from '../../services/writebackConfig';

interface Props {
  docCode: string;
  docName: string;
  patientId: string;
}

/**
 * 提交栏上方的回写目标提示条。
 * 用于展示当前设置的回写模式与目标系统，并提供快捷跳转到“设置”页面的入口。
 */
export default function WritebackTargetBar({ patientId }: Props) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<WritebackConfig | null>(null);

  useEffect(() => {
    // 初始化及后续拉取最新配置
    setConfig(getWritebackConfig());
  }, []);

  if (!config) return null;

  const mode = config.mode;
  const modeLabel = WRITEBACK_MODE_LABELS[mode] || '未知模式';

  let targetDesc = '';
  let icon = <LinkOutlined className="text-blue-500" />;

  switch (mode) {
    case 'mock':
      targetDesc = '仅本地模拟调试';
      icon = <PlaySquareOutlined className="text-slate-400" />;
      break;
    case 'bs-attached':
      targetDesc = `附着 Chrome (${config.bsDebuggerAddress})`;
      icon = <LinkOutlined className="text-emerald-500" />;
      break;
    case 'bs-auto':
      targetDesc = `自动 Chrome`;
      icon = <LinkOutlined className="text-blue-500" />;
      break;
    case 'cs-auto':
      targetDesc = `桌面窗口: ${config.csWindowTitle}`;
      icon = <DesktopOutlined className="text-purple-500" />;
      break;
    case 'clipboard':
      targetDesc = '手工逐项顺序复制粘贴';
      icon = <CopyOutlined className="text-amber-500 animate-pulse" />;
      break;
  }

  return (
    <div className="mx-5 mt-3 px-4 py-2.5 bg-gradient-to-r from-slate-50 to-blue-50/30 border border-slate-200/80 rounded-[10px] flex items-center justify-between text-[11px] text-slate-600 shadow-sm transition-all duration-300 hover:border-blue-300">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center text-sm">{icon}</span>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800">{modeLabel}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-slate-500 truncate max-w-[240px]" title={targetDesc}>
              {targetDesc}
            </span>
          </div>
          {mode !== 'mock' && mode !== 'clipboard' && (
            <span className="text-[10px] text-slate-400 font-medium scale-95 origin-left mt-0.5">
              目标病历号: {patientId}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 font-bold rounded-md transition-all active:scale-95 cursor-pointer shadow-sm"
        title="更改回写配置"
      >
        <SettingOutlined className="text-xs" />
        <span>配置</span>
      </button>
    </div>
  );
}
