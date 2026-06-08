import { LinkOutlined } from '@ant-design/icons';
import { WRITEBACK_MODE_LABEL } from '../../services/writebackConfig';

interface Props {
  patientId: string;
}

/**
 * 提交栏上方的回写目标提示条。
 * 当前演示版只保留 BS inbox 直写一种回写方式。
 */
export default function WritebackTargetBar({ patientId }: Props) {
  return (
    <div className="mx-5 mt-3 px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-blue-50/30 border border-emerald-200/80 rounded-[10px] flex items-center justify-between text-[11px] text-slate-600 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center text-sm">
          <LinkOutlined className="text-emerald-500" />
        </span>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800">{WRITEBACK_MODE_LABEL}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-slate-500">自动同步 BS 出院记录</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium scale-95 origin-left mt-0.5">
            目标病历号: {patientId}
          </span>
        </div>
      </div>
    </div>
  );
}
