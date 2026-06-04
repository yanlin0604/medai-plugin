import { useState } from 'react';
import { message } from 'antd';
import { ParadigmProps } from './types';
import ParadigmShell from './ParadigmShell';
import { useHotkey } from '../hooks/useHotkey';
import { usePatientStore } from '../stores/usePatientStore';
import EmrContextCard from '../components/clinical/EmrContextCard';
import EditableDraft from '../components/clinical/EditableDraft';
import WritebackBar from '../components/clinical/WritebackBar';
import ObjectiveTimeline from '../components/clinical/ObjectiveTimeline';
import DictationConsole from '../components/clinical/DictationConsole';
import IcdRecommend, { IcdItem } from '../components/clinical/IcdRecommend';
import { getRecordConfig } from './record/recordData';

/**
 * 范式二·事后多模态补录（首次病程/抢救/手术/会诊）。
 * 交互流：拉取客观时间轴 → 医生口述主观细节 → ICD 推荐勾选 → AI 交叉拼装草稿 → 一键回写。
 * 文书差异通过 recordData 配置注入（标杆：手术记录 DOC013）。
 */
export default function RecordParadigm({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const config = getRecordConfig(doc, currentPatient);

  const [dictation, setDictation] = useState(config.dictationInit);
  const [draft, setDraft] = useState(config.draft);
  const [hisContent, setHisContent] = useState('');
  const [hisDiagnosis, setHisDiagnosis] = useState('');
  const [locked, setLocked] = useState(false);

  // ICD 勾选实时填入术后诊断字段
  const handleIcdChange = (selected: IcdItem[]) => {
    setHisDiagnosis(selected.map((i) => `${i.name} ${i.code}`).join('；'));
  };

  const handleWriteback = () => {
    if (!draft.trim()) {
      message.error('草稿内容为空，无法回写。');
      return;
    }
    setHisContent(draft);
    setLocked(true);
    message.success('术中客观医嘱时间轴与医生口述交叉拼装成功，已回写注入 HIS！');
  };

  // F8 快捷键一键回写
  useHotkey('F8', () => { if (!locked) handleWriteback(); });

  return (
    <ParadigmShell doc={doc}>
      <div className="h-full flex overflow-hidden">
        {/* ============ 左侧：HIS 文书表单区 ============ */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8FAFC]">
          <EmrContextCard patient={config.patient} docControl={doc.name} />

          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1E3A8A] border-b-2 border-[#1E3A8A] pb-1.5 text-center">
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
                className="border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 outline-none bg-[#FDFDFD] focus:border-[#1E3A8A] focus:bg-white transition-colors h-[100px] resize-none leading-relaxed"
              />
            </div>
            {config.form.diagnosisLabel && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">{config.form.diagnosisLabel}</label>
                <textarea
                  value={hisDiagnosis}
                  onChange={(e) => setHisDiagnosis(e.target.value)}
                  placeholder="[未回写注入 - 勾选ICD推荐后自动填入]"
                  className="border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 outline-none bg-[#FDFDFD] focus:border-[#1E3A8A] focus:bg-white transition-colors h-10 resize-none"
                />
              </div>
            )}
          </section>
        </main>

        {/* ============ 右侧：AI 范式二侧边栏 ============ */}
        <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-[-10px_0_30px_rgba(15,23,42,0.03)]">
          {/* 顶部联动卡片 */}
          <div className="bg-[#F0F5FF] border-b border-[#1E3A8A]/10 px-5 py-3 text-[13px] font-bold text-[#1E3A8A]">
            {config.topCardText}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ObjectiveTimeline title={config.timelineTitle} nodes={config.timeline} />
            <DictationConsole
              title={config.dictationTitle}
              value={dictation}
              onChange={setDictation}
              mockTranscript={config.dictationMock}
            />
            <IcdRecommend title={config.icdTitle} items={config.icdItems} onChange={handleIcdChange} />
            <EditableDraft content={draft} onChange={setDraft} label={config.draftLabel} locked={locked} />
          </div>

          <WritebackBar
            label={config.writebackLabel}
            onWriteback={handleWriteback}
            locked={locked}
            onUnlock={() => {
              setLocked(false);
              message.info('回写锁定已解除，可重新编辑。');
            }}
          />
        </aside>
      </div>
    </ParadigmShell>
  );
}
