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
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[12px] text-slate-400">
        两个版本内容一致，无差异。
      </div>
    );
  }
  return (
    <article className="rounded-xl border border-[#E9E3D5] bg-[#FFFCF5] px-5 py-4 text-[12px] leading-[1.9] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      {rows.map((d) => (
        <section
          key={d.section}
          className="border-b border-dashed border-[#E9E3D5] py-3 last:border-b-0 first:pt-0 last:pb-0"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-bold text-slate-900">{d.section}：</span>
            {d.changed && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                有修改
              </span>
            )}
          </div>
          {d.changed ? (
            <div className="space-y-1.5 pl-4">
              <p className="m-0 whitespace-pre-wrap rounded-md bg-red-50 px-2 py-1 text-red-800 line-through decoration-red-500 decoration-2">
                {d.before || '（空）'}
              </p>
              <p className="m-0 whitespace-pre-wrap rounded-md bg-emerald-50 px-2 py-1 text-emerald-900 ring-1 ring-inset ring-emerald-100">
                {d.after || '（空）'}
              </p>
            </div>
          ) : (
            <p className="m-0 whitespace-pre-wrap pl-4 text-slate-700">{d.after || '（空）'}</p>
          )}
        </section>
      ))}
    </article>
  );
}
