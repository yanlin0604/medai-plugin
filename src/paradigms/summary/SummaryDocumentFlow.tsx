import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { message, Modal } from 'antd';
import { ExpandAltOutlined, HistoryOutlined, TeamOutlined } from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import DocumentChatWorkspace from '../../components/clinical/DocumentChatWorkspace';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { useHotkey } from '../../hooks/useHotkey';
import { saveDraft, loadDraft } from '../../services/draftService';
import { buildSubmitLabel, buildSubmitSnapshot, stripCitations } from '../../services/documentFlow';
import type { ClinicalSection, FieldValue } from '../../services/types';
import HistoryPullCard from './HistoryPullCard';
import type { SummaryConfig, SummaryPatient } from './summaryData';

type PreviewMode = 'read' | 'edit';

interface Props extends ParadigmProps {
  config: SummaryConfig;
}

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合近期病程记录、检验结果及医嘱调整进一步核对。`;
  if (mode === 'shorten') return text.length > 32 ? `${text.slice(0, Math.ceil(text.length * 0.68))}…` : text;
  if (mode === 'polish') return text.replace(/注意/g, '重点关注').replace(/及时/g, '必要时及时');
  return text;
}

function pointText(patient: SummaryPatient, tag: 'danger' | 'warning' | 'primary') {
  return patient.points.find((point) => point.tag === tag)?.text ?? '';
}

function buildSections(docCode: string, docName: string, patient: SummaryPatient): ClinicalSection[] {
  if (docCode === 'DOC006') {
    return [
      {
        key: 'conditionSummary',
        title: '病情要点',
        fieldKey: 'conditionSummary',
        text: pointText(patient, 'danger') || patient.draft,
        editable: true,
        source: 'emr',
        required: true,
      },
      {
        key: 'treatmentAdjustment',
        title: '今日处理',
        fieldKey: 'treatmentAdjustment',
        text: pointText(patient, 'warning'),
        editable: true,
        source: 'emr',
      },
      {
        key: 'handoverNotice',
        title: '接班注意事项',
        fieldKey: 'handoverNotice',
        text: pointText(patient, 'primary'),
        editable: true,
        source: 'ai',
        required: true,
      },
    ];
  }

  if (docCode === 'DOC099') {
    return [
      {
        key: 'basicInfo',
        title: '患者基本信息',
        fieldKey: 'basicInfo',
        text: `姓名：${patient.name}，性别：${patient.gender}，年龄：${patient.age}，住院号：${patient.admissionNo}。`,
        editable: true,
        source: 'his',
        required: true,
      },
      {
        key: 'hospitalizationInfo',
        title: '住院信息',
        fieldKey: 'hospitalizationInfo',
        text: patient.draft,
        editable: true,
        source: 'emr',
        required: true,
      },
      {
        key: 'codingAndAudit',
        title: '编码与质控',
        fieldKey: 'codingAndAudit',
        text: patient.points.map((point) => `${point.label}${point.text}`).join('；'),
        editable: true,
        source: 'ai',
      },
    ];
  }

  if (docCode === 'DOC007') {
    return [
      {
        key: 'transferReason',
        title: '转科原因',
        fieldKey: 'transferReason',
        text: pointText(patient, 'primary') || `因${patient.diagnosis ?? '病情需要'}需进一步专科诊疗，申请转科。`,
        editable: true,
        source: 'emr',
        required: true,
      },
      {
        key: 'treatmentCourse',
        title: '本科诊疗经过',
        fieldKey: 'treatmentCourse',
        text: patient.draft,
        editable: true,
        source: 'ai',
        required: true,
      },
      {
        key: 'transferAdvice',
        title: '转入后注意事项',
        fieldKey: 'transferAdvice',
        text: pointText(patient, 'warning') || pointText(patient, 'danger'),
        editable: true,
        source: 'ai',
      },
    ];
  }

  if (docCode === 'DOC008') {
    return [
      {
        key: 'stageSummary',
        title: '阶段病情摘要',
        fieldKey: 'stageSummary',
        text: pointText(patient, 'primary') || patient.draft,
        editable: true,
        source: 'emr',
        required: true,
      },
      {
        key: 'treatmentCourse',
        title: '阶段诊疗经过',
        fieldKey: 'treatmentCourse',
        text: patient.draft,
        editable: true,
        source: 'ai',
        required: true,
      },
      {
        key: 'nextPlan',
        title: '下一步计划',
        fieldKey: 'nextPlan',
        text: [pointText(patient, 'warning'), pointText(patient, 'danger')].filter(Boolean).join('；'),
        editable: true,
        source: 'ai',
      },
    ];
  }

  return [
    {
      key: 'content',
      title: docName,
      fieldKey: 'content',
      text: patient.draft,
      editable: true,
      source: 'ai',
      required: true,
    },
  ];
}

function buildMetaRows(config: SummaryConfig, patient: SummaryPatient): DocumentPaperMetaCell[][] {
  const formCells = config.form.fields.map((field) => ({
    label: field.label,
    value: field.value ?? field.placeholder ?? '待填写',
  }));
  return [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位号', value: patient.bed },
      { label: '住院号', value: patient.admissionNo },
      { label: '诊断', value: patient.diagnosis ?? '待完善' },
    ],
    formCells.slice(0, 3),
  ].filter((row) => row.length > 0);
}

export default function SummaryDocumentFlow({ doc, config }: Props) {
  const [searchParams] = useSearchParams();
  const readOnlyEntry = searchParams.get('mode') === 'read';
  const [idx, setIdx] = useState(0);
  const patient = config.patients[idx] ?? config.patients[0];
  const baseSections = useMemo(() => buildSections(doc.code, doc.name, patient), [doc.code, doc.name, patient]);
  const [sections, setSections] = useState<ClinicalSection[]>(baseSections);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>(readOnlyEntry ? 'read' : 'edit');
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
    patientId: patient.admissionNo,
    editor: '林志远 主治医师',
  });

  useEffect(() => {
    const saved = loadDraft(doc.code, patient.admissionNo);
    if (saved) {
      setSections(baseSections.map((section) => ({
        ...section,
        text: (saved.values[section.key] as string | undefined) ?? section.text,
      })));
      setLocked(saved.status === 'submitted');
    } else {
      setSections(baseSections);
      setLocked(false);
    }
    setResetKeys({});
    setPreviewMode(readOnlyEntry ? 'read' : 'edit');
  }, [baseSections, doc.code, patient.admissionNo, readOnlyEntry, setLocked]);

  useEffect(() => {
    if (readOnlyEntry || locked) return;
    const t = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values,
        content: buildSubmitSnapshot({ sections, changeSummary: '' }).content,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [doc.code, locked, patient.admissionNo, readOnlyEntry, sections]);

  const updateSection = (sectionKey: string, text: string) => {
    setSections((prev) => prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)));
  };

  const resetSection = (sectionKey: string) => {
    const base = baseSections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    setResetKeys((prev) => ({ ...prev, [sectionKey]: (prev[sectionKey] ?? 0) + 1 }));
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
    await submit({
      ...snapshot,
      draftValues: Object.fromEntries(sections.map((section) => [section.key, section.text])),
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
          <p>患者 <b>{patient.name}</b> 的<b>{doc.name}</b>将提交。</p>
          <p className="mt-1.5 text-amber-600">正文已由医生核对，提交后生成历史版本。</p>
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
      actions={!readOnlyEntry ? renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        () => {
          if (!versionCount) {
            message.info('提交后才会生成历史版本。');
            return;
          }
          openHistory();
        },
        '历史版本与修改记录',
      ) : null}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        {config.multiPatient && (
          <div className="border-b border-[#1E3A8A]/10 bg-[#F0F5FF] px-4 pt-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#1E3A8A]">
              <TeamOutlined />
              本次交接班共
              <span className="rounded-full bg-[#1E3A8A] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {config.patients.length}
              </span>
              位患者
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {config.patients.map((p, i) => (
                <button
                  key={p.admissionNo}
                  onClick={() => setIdx(i)}
                  className={`whitespace-nowrap rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium transition-all ${
                    i === idx
                      ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-[#E0E7FF] hover:text-[#1E3A8A]'
                  }`}
                >
                  {p.bed} {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-white">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前${doc.name}患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          {previewMode === 'read' ? (
            <div className="space-y-4 pb-6">
              <div className="mx-auto max-w-5xl px-8 pt-5">
                <HistoryPullCard title={config.historyTitle} pulledDocs={patient.pulledDocs} points={patient.points} />
              </div>
              <DocumentPaper
                docName={doc.name}
                patient={patient}
                sections={sections}
                metaRows={buildMetaRows(config, patient)}
              />
            </div>
          ) : (
            <DocumentChatWorkspace
                docName={doc.name}
                patient={patient}
                sections={sections}
                metaRows={buildMetaRows(config, patient)}
                actions={!readOnlyEntry ? renderActionButton(<><ExpandAltOutlined />通读全文</>, () => setPreviewMode('read')) : null}
                locked={locked}
                resetKeys={resetKeys}
                onChange={updateSection}
                onReset={resetSection}
                optimize={optimizeText}
              />
          )}
        </div>

        {!readOnlyEntry && (
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
        )}

        <VersionHistoryDrawer open={historyOpen} onClose={closeHistory} docCode={doc.code} patientId={patient.admissionNo} />
      </div>
    </ParadigmShell>
  );
}
