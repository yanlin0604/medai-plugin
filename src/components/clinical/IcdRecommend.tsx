import { useState } from 'react';
import { FileTextOutlined } from '@ant-design/icons';

export interface IcdItem {
  name: string;
  code: string;
  /** 匹配度百分比 */
  confidence: number;
}

interface Props {
  title: string;
  items: IcdItem[];
  /** 勾选变化回调，返回当前已选项 */
  onChange?: (selected: IcdItem[]) => void;
}

/**
 * ICD-10 诊断推荐复选框（勾选即采纳，自动填入 HIS 诊断字段）。
 * 对应需求"全局组件：ICD-10诊断推荐复选框（入院/首程/出院/手术记录页面）"。
 */
export default function IcdRecommend({ title, items, onChange }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (code: string) => {
    const next = { ...checked, [code]: !checked[code] };
    setChecked(next);
    onChange?.(items.filter((i) => next[i.code]));
  };

  return (
    <div className="bg-[#F0F5FF] border-[1.5px] border-[#93C5FD] rounded-xl p-3.5 space-y-1">
      <div className="text-xs font-bold text-[#1E3A8A] flex items-center gap-1.5 border-b border-[#BFDBFE] pb-1.5 mb-1">
        <FileTextOutlined />
        {title}
      </div>
      {items.map((item) => (
        <label
          key={item.code}
          className="flex items-center gap-2 text-xs py-2 border-b border-slate-200 last:border-none cursor-pointer"
        >
          <input
            type="checkbox"
            checked={!!checked[item.code]}
            onChange={() => toggle(item.code)}
            className="w-4 h-4 accent-[#1E3A8A] cursor-pointer"
          />
          <span className="text-slate-800 font-medium flex-1">{item.name}</span>
          <span className="font-bold text-[#1E3A8A] bg-[#DBEAFE] px-1.5 py-0.5 rounded text-[11px]">{item.code}</span>
          <span className="bg-[#ECFDF5] text-[#065F46] px-2 py-0.5 rounded-full text-[10px] font-bold">
            匹配度 {item.confidence}%
          </span>
        </label>
      ))}
    </div>
  );
}
