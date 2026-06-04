export interface TranscriptSegment {
  speaker: string;
  text: string;
}

interface Props {
  title?: string;
  segments: TranscriptSegment[];
}

// 将 [xxx已脱敏] 占位符渲染为红色脱敏高亮
function renderWithPii(text: string) {
  const parts = text.split(/(\[[^\]]*已脱敏\])/g);
  return parts.map((p, i) =>
    /^\[[^\]]*已脱敏\]$/.test(p) ? (
      <span
        key={i}
        className="bg-[#FFE4E6] text-[#E11D48] px-1 rounded border border-dashed border-[#E11D48]/30 font-medium"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/**
 * 问诊录音实时转写流 + PII 隐私脱敏高亮。
 * 对应需求"全局组件：PII隐私脱敏高亮（红色占位符标记已脱敏的手机号/地址/身份证）"。
 */
export default function TranscriptCard({ title, segments }: Props) {
  return (
    <div>
      {title && <div className="text-xs font-bold text-slate-700 mb-1.5">{title}</div>}
      <div className="bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 text-xs max-h-[160px] overflow-y-auto leading-[1.6] space-y-1.5">
        {segments.map((s, i) => (
          <p key={i}>
            <strong className="text-slate-800">{s.speaker}：</strong>
            <span className="text-slate-600">{renderWithPii(s.text)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
