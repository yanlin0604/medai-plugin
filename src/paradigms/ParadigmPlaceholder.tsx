import { DocDefinition, ParadigmId, PARADIGMS } from '../config/docRegistry';
import ParadigmShell from './ParadigmShell';
import { ToolOutlined, CheckCircleOutlined } from '@ant-design/icons';

/** 各范式将实现的关键 UI 组件清单（来自需求"全局交互组件汇总"） */
const PARADIGM_FEATURES: Record<ParadigmId, string[]> = {
  summary: ['EMR 历史病历自动拉取标签组', '三维要点提炼（危急/方案调整/待办）', '多患者交接切换选项卡', 'AI 汇总草稿预览', '提交文书'],
  record: ['客观医嘱用药时间轴', '医生口述补录面板（语音转写）', '术后诊断 ICD-10 推荐', 'AI 主客观交叉拼装草稿', '提交文书'],
  recording: ['连续录音控制台 + 动态波形', '声纹发言人识别卡片', 'PII 隐私脱敏高亮', '关键要素核对', '三级质控气泡', '防串户双向锁熔断'],
  special: ['AI 能力边界警告横幅', '住院经过摘要（AI 仅排版填充）', '死亡原因分析（人工锁定撰写）', '强制上级医师审核'],
};

/**
 * 范式占位容器：在范式实体实现前，展示统一双栏架构（左 HIS 表单 + 右 AI 侧边栏）
 * 与该范式将落地的关键功能清单。task4/5/6 将逐一替换为完整实现。
 */
export default function ParadigmPlaceholder({ doc }: { doc: DocDefinition }) {
  const meta = PARADIGMS[doc.paradigm];
  const features = PARADIGM_FEATURES[doc.paradigm];

  return (
    <ParadigmShell doc={doc}>
      <div className="h-full flex overflow-hidden">
        {/* 左侧 HIS 表单区占位 */}
        <div className="flex-1 flex flex-col items-center justify-center bg-white border-r border-slate-200 text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-2xl">
            <ToolOutlined />
          </div>
          <h3 className="text-sm font-extrabold text-slate-700 mt-4">HIS「{doc.name}」表单编辑区</h3>
          <p className="text-xs text-slate-400 mt-1.5 max-w-[280px] leading-relaxed">
            左侧为 HIS 模拟外壳的文书表单，AI 侧边栏生成的内容将通过提交操作注入此处对应字段。
          </p>
        </div>

        {/* 右侧 AI 侧边栏占位 */}
        <div className="w-[300px] bg-[#F8FAFC] flex flex-col p-4 overflow-y-auto shrink-0 shadow-inner">
          <div
            className="rounded-xl p-3.5 border text-white"
            style={{ background: meta.accent, borderColor: meta.accent }}
          >
            <p className="text-[10px] font-bold opacity-80">当前交互范式</p>
            <h4 className="text-sm font-extrabold mt-0.5">{meta.name}</h4>
            <p className="text-[10px] opacity-90 leading-relaxed mt-1.5">{meta.desc}</p>
          </div>

          <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">
              该范式界面将包含
            </h4>
            <ul className="mt-3 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[11px] text-slate-600 font-medium">
                  <CheckCircleOutlined className="text-slate-300 mt-0.5 shrink-0" style={{ color: `${meta.accent}99` }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-4 font-medium">
            原型参考：{doc.prototype}
          </p>
        </div>
      </div>
    </ParadigmShell>
  );
}
