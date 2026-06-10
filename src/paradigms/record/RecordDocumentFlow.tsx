import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  ExpandAltOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import EditableDocumentPaper from '../../components/clinical/EditableDocumentPaper';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import ObjectiveTimeline from '../../components/clinical/ObjectiveTimeline';
import DictationConsole from '../../components/clinical/DictationConsole';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { useHotkey } from '../../hooks/useHotkey';
import { saveDraft, loadDraft } from '../../services/draftService';
import { buildSubmitLabel, buildSubmitSnapshot } from '../../services/documentFlow';
import type { ClinicalSection, FieldValue, IcdItem } from '../../services/types';
import type { RecordConfig } from './recordData';

type PreviewMode = 'read' | 'edit';

interface Props extends ParadigmProps {
  config: RecordConfig;
}

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合事件时间轴、生命体征变化及后续处理结果进一步补充。`;
  if (mode === 'shorten') return text.length > 32 ? `${text.slice(0, Math.ceil(text.length * 0.68))}…` : text;
  if (mode === 'polish') return text.replace(/顺利/g, '过程顺利').replace(/无特殊/g, '未见特殊异常');
  return text;
}

function timelineText(config: RecordConfig) {
  return config.timeline.map((node) => `${node.time} ${node.text}`).join('；');
}

function buildSections(docCode: string, docName: string, config: RecordConfig, diagnosisText: string): ClinicalSection[] {
  const timelineTitle = docCode === 'DOC009' ? '抢救时间轴' : '客观时间轴';
  const narrativeTitle = docCode === 'DOC013' ? '医生补充手术细节' : '医生口述补充';
  const draftTitle = docCode === 'DOC002' ? '首次病程记录正文' : `${docName}正文`;
  return [
    {
      key: 'objectiveTimeline',
      title: timelineTitle,
      fieldKey: 'objectiveTimeline',
      text: timelineText(config),
      editable: true,
      source: docCode === 'DOC013' || docCode === 'DOC009' ? 'manual' : 'his',
      required: true,
    },
    {
      key: 'doctorNarrative',
      title: narrativeTitle,
      fieldKey: 'doctorNarrative',
      text: config.dictationInit,
      editable: true,
      source: 'asr',
    },
    {
      key: 'relatedDiagnosis',
      title: config.form.diagnosisLabel ?? '相关诊断',
      fieldKey: 'relatedDiagnosis',
      text: diagnosisText,
      editable: true,
      source: 'ai',
    },
    {
      key: 'finalDraft',
      title: draftTitle,
      fieldKey: 'finalDraft',
      text: config.draft,
      editable: true,
      source: 'ai',
      required: true,
    },
  ];
}

function buildMetaRows(config: RecordConfig): DocumentPaperMetaCell[][] {
  const formCells = config.form.fields.map((field) => ({
    label: field.label,
    value: field.value ?? field.placeholder ?? '待填写',
  }));
  return [
    [
      { label: '姓名', value: config.patient.name },
      { label: '性别', value: config.patient.gender },
      { label: '年龄', value: config.patient.age },
    ],
    [
      { label: '床位号', value: config.patient.bed },
      { label: '住院号', value: config.patient.admissionNo },
      { label: '诊断', value: config.patient.diagnosis ?? '待完善' },
    ],
    formCells.slice(0, 3),
  ].filter((row) => row.length > 0);
}

export default function RecordDocumentFlow({ doc, config }: Props) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [voicePanelOpen, setVoicePanelOpen] = useState(true);
  const [diagnoses, setDiagnoses] = useState<IcdItem[]>([]);
  const [dictation, setDictation] = useState(config.dictationInit);
  const diagnosisText = useMemo(() => diagnoses.map((item) => `${item.name} ${item.code}`).join('；'), [diagnoses]);
  const baseSections = useMemo(() => buildSections(doc.code, doc.name, config, diagnosisText), [config, diagnosisText, doc.code, doc.name]);
  const [sections, setSections] = useState<ClinicalSection[]>(baseSections);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const {
    locked,
    setLocked,
    mismatch,
    historyOpen,
    openHistory,
    closeHistory,
    versionCount,
    submitting,
    submitText,
    submitProgress,
    submit,
  } = useDocumentSubmit({
    docCode: doc.code,
    docName: doc.name,
    patientId: config.patient.admissionNo,
    editor: '林志远 主治医师',
  });

  useEffect(() => {
    const saved = loadDraft(doc.code, config.patient.admissionNo);
    if (saved) {
      setSections(baseSections.map((section) => ({
        ...section,
        text: (saved.values[section.key] as string | undefined) ?? section.text,
      })));
      setDictation((saved.values.doctorNarrative as string | undefined) ?? config.dictationInit);
      setDiagnoses((saved.values.relatedDiagnoses as IcdItem[] | undefined) ?? []);
      setLocked(saved.status === 'submitted');
    } else {
      setSections(baseSections);
      setDictation(config.dictationInit);
      setDiagnoses([]);
      setLocked(false);
    }
    setResetKeys({});
    setPreviewMode('read');
  }, [baseSections, config.dictationInit, config.patient.admissionNo, doc.code, setLocked]);

  useEffect(() => {
    setSections((prev) => prev.map((section) => (
      section.key === 'relatedDiagnosis' ? { ...section, text: diagnosisText } : section
    )));
  }, [diagnosisText]);

  useEffect(() => {
    if (locked) return;
    const t = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
      values.relatedDiagnoses = diagnoses;
      values.doctorNarrative = dictation;
      saveDraft({
        docCode: doc.code,
        patientId: config.patient.admissionNo,
        values,
        content: buildSubmitSnapshot({ sections, changeSummary: '' }).content,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [config.patient.admissionNo, diagnoses, dictation, doc.code, locked, sections]);

  const updateSection = (sectionKey: string, text: string) => {
    setSections((prev) => prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)));
  };

  const resetSection = (sectionKey: string) => {
    const base = baseSections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    setResetKeys((prev) => ({ ...prev, [sectionKey]: (prev[sectionKey] ?? 0) + 1 }));
  };

  const appendDictationToDraft = () => {
    const text = dictation.trim();
    if (!text) {
      message.warning('口述内容为空，无法并入正文。');
      return;
    }
    const targetKey = config.dictationAppendSectionKey ?? 'doctorNarrative';
    setSections((prev) => prev.map((section) => {
      if (section.key !== targetKey) return section;
      const nextText = section.text ? `${section.text}\n${text}` : text;
      return { ...section, text: nextText };
    }));
    message.success('口述内容已并入对应段落，请继续核对。');
  };

  const doSubmit = async () => {
    const snapshot = buildSubmitSnapshot({
      sections,
      changeSummary: `医生确认提交${doc.name}`,
    });
    if (!snapshot.content.trim()) {
      message.error('草稿内容为空，无法提交。');
      return;
    }
    const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
    values.relatedDiagnoses = diagnoses;
    values.doctorNarrative = dictation;
    await submit({
      ...snapshot,
      draftValues: values,
      draftStep: 1,
    });
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止提交。请先在病历系统中切回当前患者。');
      return;
    }
    Modal.confirm({
      title: `确认提交${doc.name}？`,
      width: 380,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>患者 <b>{config.patient.name}</b> 的<b>{doc.name}</b>将提交。</p>
          <p className="mt-1.5 text-amber-600">客观时间轴、口述补充和诊断字段将一并生成版本。</p>
        </div>
      ),
      onOk: () => {
        void doSubmit();
      },
    });
  };

  useHotkey('F8', () => {
    if (!locked) handleSubmit();
  });

  const renderActionButton = (children: ReactNode, onClick: () => void, title?: string) => (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 text-[11px] font-semibold border rounded-md px-2 py-1 text-slate-500 hover:text-[#1E3A8A] border-slate-200 hover:border-[#1E3A8A] transition-colors"
    >
      {children}
    </button>
  );

  return (
    <ParadigmShell
      doc={doc}
      showParadigmBadge={false}
      showPatientId={false}
      actions={renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        () => {
          if (!versionCount) {
            message.info('提交后才会生成历史版本。');
            return;
          }
          openHistory();
        },
        '历史版本与修改记录',
      )}
    >
      <div className="h-full flex overflow-hidden bg-white">
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前${doc.name}患者「${config.patient.name}」不一致！防串户锁已锁定，禁止提交。`} />
          <div className="flex-1 overflow-y-auto">
            {previewMode === 'read' ? (
              <DocumentPaper
                docName={doc.name}
                patient={config.patient}
                sections={sections}
                metaRows={buildMetaRows(config)}
                actions={renderActionButton(
                  <><ReloadOutlined />编辑</>,
                  () => setPreviewMode('edit'),
                  `编辑${doc.name}`,
                )}
              />
            ) : (
              <div className="p-4 space-y-3">
                <EditableDocumentPaper
                  docName={doc.name}
                  patient={config.patient}
                  sections={sections}
                  metaRows={buildMetaRows(config)}
                  actions={renderActionButton(<><ExpandAltOutlined />通读全文</>, () => setPreviewMode('read'))}
                  locked={locked}
                  resetKeys={resetKeys}
                  onChange={updateSection}
                  onReset={resetSection}
                  optimize={optimizeText}
                />
              </div>
            )}
          </div>
          <WritebackBar
            label={buildSubmitLabel(doc.name)}
            onWriteback={handleSubmit}
            locked={locked}
            disabled={mismatch}
            busy={submitting}
            busyText={submitText}
            progress={submitProgress}
            onUnlock={() => {
              setLocked(false);
              message.info('已解除锁定，可重新编辑后再次提交。');
            }}
          />
        </main>

        <aside
          className={`${voicePanelOpen ? 'w-[360px]' : 'w-[52px]'} shrink-0 border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.03)] transition-[width] duration-200 ease-out`}
        >
          {voicePanelOpen ? (
            <>
              <div className="flex items-center gap-2 border-b border-[#1E3A8A]/10 bg-[#F0F5FF] px-4 py-3 text-[13px] font-bold text-[#1E3A8A]">
                <span className="min-w-0 flex-1 truncate">{config.topCardText}</span>
                <button
                  type="button"
                  onClick={() => setVoicePanelOpen(false)}
                  title="收起语音面板"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#BFDBFE] bg-white/70 text-[#1E3A8A] hover:bg-white"
                >
                  <MenuFoldOutlined />
                </button>
              </div>
              <div className="h-[calc(100%-52px)] overflow-y-auto p-4 space-y-4">
                {config.showTimelinePanel !== false && (
                  <ObjectiveTimeline title={config.timelineTitle} nodes={config.timeline} />
                )}
                <DictationConsole
                  title={config.dictationTitle}
                  value={dictation}
                  onChange={setDictation}
                  mockTranscript={config.dictationMock}
                />
                <button
                  onClick={appendDictationToDraft}
                  disabled={locked}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#F0F5FF] px-3 py-2 text-xs font-bold text-[#1E3A8A] hover:bg-[#DBEAFE] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusOutlined />
                  并入口述段落
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setVoicePanelOpen(true)}
              title="展开语音面板"
              className="flex h-full w-full flex-col items-center gap-2 bg-[#F8FAFC] px-2 py-4 text-[#1E3A8A] hover:bg-[#F0F5FF]"
            >
              <MenuUnfoldOutlined />
              <span className="text-[12px] font-bold [writing-mode:vertical-rl]">语音</span>
            </button>
          )}
        </aside>

        <VersionHistoryDrawer open={historyOpen} onClose={closeHistory} docCode={doc.code} patientId={config.patient.admissionNo} />
      </div>
    </ParadigmShell>
  );
}
