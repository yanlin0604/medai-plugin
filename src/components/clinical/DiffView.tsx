import type { SectionDiff } from '../../services/types';

interface Props {
  diffs: SectionDiff[];
  /** 仅显示有变化的段落 */
  changedOnly?: boolean;
}

/**
 * 版本/修改差异视图（红删除 + 绿新增），复用划词优化对比的视觉语言。
 * 全文书通用：版本历史对比、草稿与已提交版本对比等。
 */
export default function DiffView({ diffs, changedOnly }: Props) {
  const rows = changedOnly ? diffs.filter((d) => d.changed) : diffs;
  if (!rows.length) {
    return <div className="text-[11px] text-slate-400 text-center py-4">两个版本内容一致，无差异。</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((d) => (
        <div
          key={d.section}
          className={`rounded-lg p-2.5 text-[11.5px] border ${
            d.changed ? 'border-[#93C5FD] bg-[#F0F5FF]' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="font-bold text-slate-600 mb-1 flex items-center gap-1.5">
            【{d.section}】
            {d.changed ? (
              <span className="text-[9px] font-normal text-[#1E3A8A] bg-white px-1 rounded border border-[#93C5FD]">已修改</span>
            ) : (
              <span className="text-[9px] font-normal text-slate-400">无变化</span>
            )}
          </div>
          {d.changed ? (
            <div className="space-y-1 leading-relaxed">
              <div>
                <span className="bg-[#FEE2E2] text-[#991B1B] line-through px-1 rounded">{d.before || '（空）'}</span>
              </div>
              <div>
                <span className="bg-[#D1FAE5] text-[#065F46] px-1 rounded">{d.after || '（空）'}</span>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 leading-relaxed">{d.after}</div>
          )}
        </div>
      ))}
    </div>
  );
}
