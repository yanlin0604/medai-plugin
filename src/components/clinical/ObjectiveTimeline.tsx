export interface TimelineNode {
  time: string;
  text: string;
  /** 关键节点（实心圆点） */
  highlight?: boolean;
}

interface Props {
  title: string;
  nodes: TimelineNode[];
}

/**
 * 客观事件时间轴（范式二核心：手麻/手术医嘱、抢救过程的客观时间线）。
 * 对应需求"全局组件：客观时间轴（抢救记录、手术记录页面）"。
 */
export default function ObjectiveTimeline({ title, nodes }: Props) {
  return (
    <div className="bg-[#FFFDF5] border-[1.5px] border-[#FDE047] rounded-xl p-3.5 space-y-2.5 shadow-[0_4px_10px_rgba(253,224,71,0.05)]">
      <div className="text-xs font-bold text-[#854D0E] flex items-center gap-1.5 border-b border-[#FEF08A] pb-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {title}
      </div>
      <div className="border-l-2 border-[#1E3A8A] pl-3 ml-1.5 space-y-2 py-1">
        {nodes.map((n, i) => (
          <div key={i} className="relative text-[11px] text-slate-500 leading-[1.5]">
            <span
              className="absolute -left-[17px] top-1 w-2 h-2 rounded-full border-2 border-[#1E3A8A]"
              style={{ background: n.highlight ? '#1E3A8A' : 'white' }}
            />
            <span className="font-bold text-[#1E3A8A]">{n.time}</span> {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}
