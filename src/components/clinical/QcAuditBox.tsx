export interface QcBubble {
  level: 'blue' | 'yellow' | 'red';
  tag: string;
  text: string;
}

interface Props {
  title?: string;
  grade: string;
  score: number;
  bubbles: QcBubble[];
}

const bubbleStyle: Record<QcBubble['level'], string> = {
  blue: 'bg-[#F0F5FF] text-[#1E3A8A]',
  yellow: 'bg-[#FFFBEB] text-[#854D0E]',
  red: 'bg-[#FFF5F5] text-[#EF4444]',
};

/**
 * 三级质控气泡（严重红/警告黄/提示蓝）。
 * 对应需求"全局组件：三级质控气泡（入院/首程/上级查房记录页面）"。
 */
export default function QcAuditBox({ title, grade, score, bubbles }: Props) {
  return (
    <div className="bg-[#FAF8F5] border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex justify-between text-[11px] font-bold border-b border-dashed border-slate-200 pb-1.5">
        <span>{title ?? '🩺 病历书写三级临床质控分析'}</span>
        <span className="text-[#1E3A8A]">评定等级：{grade} ({score}分)</span>
      </div>
      {bubbles.map((b, i) => (
        <div key={i} className={`flex items-start gap-1.5 text-[11px] leading-[1.5] px-2 py-1.5 rounded ${bubbleStyle[b.level]}`}>
          <span className="font-bold shrink-0">{b.tag}</span>
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}
