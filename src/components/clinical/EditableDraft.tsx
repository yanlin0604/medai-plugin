import { useRef, useEffect } from 'react';

interface Props {
  /** 草稿文本内容 */
  content: string;
  onChange?: (text: string) => void;
  label?: string;
  /** 锁定后不可编辑 */
  locked?: boolean;
}

/**
 * 可编辑 AI 草稿卡片（米色纸张质感 + 编辑中指示器）。
 * 全范式通用：AI 生成的病历草稿在此供医生微调，对应原型 doc-draft-card。
 * contenteditable 采用 ref 同步策略，避免受控组件导致的光标跳动。
 */
export default function EditableDraft({ content, onChange, label, locked }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 外部 content 变化（如切换患者）时同步到 DOM；
  // 仅在不一致时写入，避免输入过程中重置光标。
  useEffect(() => {
    if (ref.current && ref.current.textContent !== content) {
      ref.current.textContent = content;
    }
  }, [content]);

  return (
    <div>
      {label && (
        <div className="text-xs font-bold text-slate-700 mb-1.5 flex justify-between">
          <span>{label}</span>
        </div>
      )}
      <div className="relative group">
        <span className="absolute top-2 right-2.5 bg-[#2563EB] text-white text-[10px] font-semibold px-2 py-0.5 rounded opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none z-10">
          编辑中...
        </span>
        <div
          ref={ref}
          contentEditable={!locked}
          suppressContentEditableWarning
          onInput={(e) => onChange?.(e.currentTarget.textContent || '')}
          className="bg-[#FAF8F5] border border-[#E9E3D5] rounded-xl p-3.5 text-[12.5px] leading-[1.8] text-slate-700 outline-none transition-all focus:border-[#2563EB] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
        />
      </div>
    </div>
  );
}
