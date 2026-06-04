import { ClockCircleOutlined, CheckCircleFilled } from '@ant-design/icons';

export interface SummaryPoint {
  /** 要点类型：危急/方案调整/待办 */
  tag: 'danger' | 'warning' | 'primary';
  label: string;
  text: string;
}

interface Props {
  title: string;
  /** 静默拉取的历史文档名 */
  pulledDocs: string[];
  /** AI 分词提炼的三维要点 */
  points: SummaryPoint[];
}

const pointColor: Record<SummaryPoint['tag'], string> = {
  danger: 'text-[#EF4444]',
  warning: 'text-[#F59E0B]',
  primary: 'text-[#1E3A8A]',
};

/**
 * 范式一核心组件：EMR 历史静默拉取 + 分词提炼要点卡片（黄色基调）。
 * 对应需求图3-5"EMR历史拉取与分词提炼卡片"与"全局组件：EMR历史拉取标签组"。
 */
export default function HistoryPullCard({ title, pulledDocs, points }: Props) {
  return (
    <div className="bg-[#FFFDF5] border-[1.5px] border-[#FDE047] rounded-xl p-3.5 space-y-2.5 shadow-[0_4px_10px_rgba(253,224,71,0.05)]">
      <div className="text-xs font-bold text-[#854D0E] flex items-center gap-1.5 border-b border-[#FEF08A] pb-1.5">
        <ClockCircleOutlined />
        {title}
      </div>

      {/* 拉取文档标签组 */}
      <div className="flex gap-1.5 flex-wrap">
        {pulledDocs.map((d) => (
          <span
            key={d}
            className="bg-[#ECFDF5] border border-emerald-500 text-emerald-600 font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1"
          >
            <CheckCircleFilled className="text-[9px]" />
            {d}
          </span>
        ))}
      </div>

      {/* 三维提炼要点 */}
      <div className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-2">
        {points.map((p, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[11.5px] leading-[1.5]">
            <span className={`font-bold shrink-0 ${pointColor[p.tag]}`}>{p.label}</span>
            <span className="text-slate-600">{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
