import { useState, useEffect } from 'react';
import { message } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { ParadigmProps } from './types';
import ParadigmShell from './ParadigmShell';
import { useHotkey } from '../hooks/useHotkey';
import { usePatientStore } from '../stores/usePatientStore';
import EmrContextCard from '../components/clinical/EmrContextCard';
import EditableDraft from '../components/clinical/EditableDraft';
import WritebackBar from '../components/clinical/WritebackBar';
import HistoryPullCard from './summary/HistoryPullCard';
import { getSummaryConfig } from './summary/summaryData';

/**
 * 范式一·系统自动汇总（交接班/转科/阶段小结/出院记录）。
 * 交互流：静默拉取 EMR 历史 → 分词提炼三维要点 → 渲染汇总草稿 → 医生微调 → 一键回写。
 * 文书差异通过 summaryData 配置注入（标杆：交接班 DOC006）。
 */
export default function SummaryParadigm({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const config = getSummaryConfig(doc, currentPatient);

  const [idx, setIdx] = useState(0);
  const patient = config.patients[idx] ?? config.patients[0];

  const [draft, setDraft] = useState(patient.draft);
  const [hisContent, setHisContent] = useState('');
  const [locked, setLocked] = useState(false);

  // 切换患者时重置草稿与回写态
  useEffect(() => {
    setDraft(patient.draft);
    setHisContent('');
    setLocked(false);
  }, [idx, patient.draft]);

  const handleWriteback = () => {
    if (!draft.trim()) {
      message.error('草稿内容为空，无法回写。');
      return;
    }
    setHisContent(draft);
    setLocked(true);
    message.success('EMR 历史病历静默抓取清洗成功，提炼要点已 100% 同步注入 HIS 表单！');
  };

  // F8 快捷键一键回写
  useHotkey('F8', () => { if (!locked) handleWriteback(); });

  return (
    <ParadigmShell doc={doc}>
      <div className="h-full flex overflow-hidden">
        {/* ============ 左侧：HIS 文书表单区 ============ */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8FAFC]">
          <EmrContextCard patient={patient} docControl={doc.name} />

          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1E3A8A] border-b-2 border-[#1E3A8A] pb-1.5">
              {config.form.title}
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {config.form.fields.map((f) => (
                <div key={f.label} className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-600">{f.label}</label>
                  <input
                    type="text"
                    defaultValue={f.value}
                    placeholder={f.placeholder}
                    className="border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 outline-none bg-[#FDFDFD] focus:border-[#1E3A8A] focus:bg-white transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">{config.form.contentLabel}</label>
              <textarea
                value={hisContent}
                onChange={(e) => setHisContent(e.target.value)}
                placeholder="[未回写注入]"
                className="border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 outline-none bg-[#FDFDFD] focus:border-[#1E3A8A] focus:bg-white transition-colors h-40 resize-none leading-relaxed"
              />
            </div>
          </section>
        </main>

        {/* ============ 右侧：AI 范式一侧边栏 ============ */}
        <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-[-10px_0_30px_rgba(15,23,42,0.03)]">
          {/* 多患者交接切换 */}
          {config.multiPatient && (
            <div className="bg-[#F0F5FF] border-b border-[#1E3A8A]/10 px-4 pt-2.5">
              <div className="text-xs font-bold text-[#1E3A8A] mb-2 flex items-center gap-1.5">
                <TeamOutlined />
                本次交接班共
                <span className="bg-[#1E3A8A] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {config.patients.length}
                </span>
                位患者
              </div>
              <div className="flex gap-1">
                {config.patients.map((p, i) => (
                  <button
                    key={p.admissionNo}
                    onClick={() => setIdx(i)}
                    className={`px-3 py-1.5 rounded-t-md text-xs font-medium border border-b-0 transition-all whitespace-nowrap ${
                      i === idx
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-[#E0E7FF] hover:text-[#1E3A8A]'
                    }`}
                  >
                    {p.bed} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 滚动内容区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <HistoryPullCard title={config.historyTitle} pulledDocs={patient.pulledDocs} points={patient.points} />
            <EditableDraft content={draft} onChange={setDraft} label={config.draftLabel} locked={locked} />
          </div>

          {/* 一键回写 */}
          <WritebackBar
            label={config.writebackLabel}
            onWriteback={handleWriteback}
            locked={locked}
            onUnlock={() => {
              setLocked(false);
              message.info('回写锁定已解除，可重新编辑草稿。');
            }}
          />
        </aside>
      </div>
    </ParadigmShell>
  );
}
