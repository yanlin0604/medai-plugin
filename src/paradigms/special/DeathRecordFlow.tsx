import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import EditableDocumentPaper from '../../components/clinical/EditableDocumentPaper';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import WritebackBar from '../../components/clinical/WritebackBar';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { useHotkey } from '../../hooks/useHotkey';
import { buildSubmitLabel, buildSubmitSnapshot } from '../../services/documentFlow';
import { loadDraft, saveDraft } from '../../services/draftService';
import type { ClinicalSection, FieldValue } from '../../services/types';
import type { DeathRecordConfig } from './deathData';

type PreviewMode = 'read' | 'edit';

interface Props extends ParadigmProps {
  config: DeathRecordConfig;
}

function optimizeText(text: string, mode: string): string {
  if (mode === 'shorten') return text.length > 36 ? `${text.slice(0, Math.ceil(text.length * 0.72))}...` : text;
  return normalizeText(text);
}

function normalizeText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\s{2,}/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function collectMissingItems(
  config: DeathRecordConfig,
  fields: Record<string, string>,
  sections: ClinicalSection[],
  seniorReviewConfirmed: boolean,
): string[] {
  const fieldMissing = config.fields
    .filter((field) => field.required && !fields[field.key]?.trim())
    .map((field) => field.label);
  const sectionMissing = sections
    .filter((section) => section.required && !section.text.trim())
    .map((section) => section.title);

  return [
    ...fieldMissing,
    ...sectionMissing,
    ...(seniorReviewConfirmed ? [] : ['上级医师审核确认']),
  ];
}

function buildMetaRows(config: DeathRecordConfig, fields: Record<string, string>): DocumentPaperMetaCell[][] {
  const fieldValue = (key: string) => fields[key]?.trim() || '待填写';
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
    [
      { label: '死亡时间', value: fieldValue('deathTime') },
      { label: '死亡地点', value: fieldValue('deathPlace') },
      { label: '审核医师', value: fieldValue('seniorReviewer') },
    ],
  ];
}

export default function DeathRecordFlow({ doc, config }: Props) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [fields, setFields] = useState<Record<string, string>>(() => (
    Object.fromEntries(config.fields.map((field) => [field.key, field.value]))
  ));
  const [sections, setSections] = useState<ClinicalSection[]>(config.sections);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [seniorReviewConfirmed, setSeniorReviewConfirmed] = useState(false);
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
  const missingItems = useMemo(
    () => collectMissingItems(config, fields, sections, seniorReviewConfirmed),
    [config, fields, sections, seniorReviewConfirmed],
  );

  useEffect(() => {
    const saved = loadDraft(doc.code, config.patient.admissionNo);
    if (saved) {
      setFields(Object.fromEntries(config.fields.map((field) => [
        field.key,
        (saved.values[field.key] as string | undefined) ?? field.value,
      ])));
      setSections(config.sections.map((section) => ({
        ...section,
        text: (saved.values[section.key] as string | undefined) ?? section.text,
      })));
      setSeniorReviewConfirmed(saved.status === 'submitted');
      setLocked(saved.status === 'submitted');
    } else {
      setFields(Object.fromEntries(config.fields.map((field) => [field.key, field.value])));
      setSections(config.sections);
      setSeniorReviewConfirmed(false);
      setLocked(false);
    }
    setResetKeys({});
    setPreviewMode('read');
  }, [config, doc.code, setLocked]);

  useEffect(() => {
    if (locked) return;
    const timer = window.setTimeout(() => {
      const values: Record<string, FieldValue> = {
        ...fields,
        ...Object.fromEntries(sections.map((section) => [section.key, section.text])),
      };
      saveDraft({
        docCode: doc.code,
        patientId: config.patient.admissionNo,
        values,
        content: buildSubmitSnapshot({ sections, changeSummary: '', includeEmptySections: true }).content,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [config.patient.admissionNo, doc.code, fields, locked, sections]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const updateSection = (sectionKey: string, text: string) => {
    setSections((prev) => prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)));
  };

  const resetSection = (sectionKey: string) => {
    const base = config.sections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    setResetKeys((prev) => ({ ...prev, [sectionKey]: (prev[sectionKey] ?? 0) + 1 }));
  };

  const formatManuallyEnteredText = () => {
    setFields((prev) => Object.fromEntries(
      Object.entries(prev).map(([key, value]) => [key, normalizeText(value)]),
    ));
    setSections((prev) => prev.map((section) => ({ ...section, text: normalizeText(section.text) })));
    setResetKeys((prev) => Object.fromEntries(sections.map((section) => [
      section.key,
      (prev[section.key] ?? 0) + 1,
    ])));
    message.success('已整理格式，未生成新的死亡原因或诊疗结论。');
  };

  const doSubmit = async () => {
    const latestMissing = collectMissingItems(config, fields, sections, seniorReviewConfirmed);
    if (latestMissing.length) {
      message.error(`请先完善：${latestMissing.slice(0, 3).join('、')}`);
      return;
    }

    const snapshot = buildSubmitSnapshot({
      sections,
      changeSummary: `人工审核后提交${doc.name}`,
      includeEmptySections: true,
    });
    const structuredFields = Object.fromEntries(config.fields.map((field) => [
      field.key,
      fields[field.key]?.trim() ?? '',
    ]));
    const structuredLabels = Object.fromEntries(config.fields.map((field) => [field.key, field.label]));
    const draftValues: Record<string, FieldValue> = {
      ...structuredFields,
      ...Object.fromEntries(sections.map((section) => [section.key, section.text])),
    };

    await submit({
      fields: { ...structuredFields, ...snapshot.fields },
      fieldLabels: { ...structuredLabels, ...snapshot.fieldLabels },
      fieldOrder: [...config.fields.map((field) => field.key), ...snapshot.fieldOrder],
      content: snapshot.content,
      changeSummary: snapshot.changeSummary,
      draftValues,
      draftStep: 1,
    });
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止提交。请先在病历系统中切回当前患者。');
      return;
    }
    if (missingItems.length) {
      Modal.warning({
        title: '死亡记录尚未完成审核',
        width: 420,
        content: (
          <div className="space-y-1.5 text-[12px] leading-relaxed text-slate-600">
            {missingItems.map((item) => <p key={item}>请完善：{item}</p>)}
          </div>
        ),
      });
      return;
    }

    Modal.confirm({
      title: `确认提交${doc.name}？`,
      width: 420,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>患者 <b>{config.patient.name}</b> 的死亡记录将提交。</p>
          <p className="mt-1.5 text-rose-600">已确认死亡原因、死亡诊断和核心结论均由医生人工填写，并完成上级审核。</p>
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
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
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
      <div className="flex h-full overflow-hidden bg-white">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前死亡记录患者「${config.patient.name}」不一致！防串户锁已锁定，禁止提交。`} />
          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-[12px] font-bold leading-relaxed text-rose-700">
              <WarningOutlined className="mr-1" />
              AI 能力边界：本页不提供语音采集，不自动生成死亡原因、死亡诊断或诊疗结论；仅支持人工编辑和格式整理。
            </div>

            {previewMode === 'read' ? (
              <DocumentPaper
                docName={doc.name}
                patient={config.patient}
                sections={sections}
                metaRows={buildMetaRows(config, fields)}
                emptyText="（请人工填写）"
                actions={renderActionButton(<><FileTextOutlined />编辑</>, () => setPreviewMode('edit'))}
              />
            ) : (
              <div className="p-4">
                <EditableDocumentPaper
                  docName={doc.name}
                  patient={config.patient}
                  sections={sections}
                  metaRows={buildMetaRows(config, fields)}
                  actions={renderActionButton(<><FileTextOutlined />预览</>, () => setPreviewMode('read'))}
                  locked={locked}
                  resetKeys={resetKeys}
                  readOnlyHints={{ patientIdentity: 'HIS' }}
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
              setSeniorReviewConfirmed(false);
              message.info('已解除锁定，请重新完成上级审核确认后再提交。');
            }}
          />
        </main>

        <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-slate-200 bg-[#F8FAFC] p-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-slate-800">结构化字段</div>
              <button
                onClick={formatManuallyEnteredText}
                disabled={locked}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ReloadOutlined />
                格式整理
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {config.fields.map((field) => (
                <label key={field.key} className="block">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">
                      {field.label}
                      {field.required && <span className="ml-0.5 text-rose-500">*</span>}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                      {field.source}
                    </span>
                  </div>
                  <textarea
                    value={fields[field.key] ?? ''}
                    placeholder={field.placeholder}
                    disabled={locked}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    className="min-h-[58px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-[#1E3A8A] disabled:bg-slate-50"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-extrabold text-slate-800">缺项与审核</div>
            <div className="mt-3 space-y-2">
              {missingItems.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700">
                  <CheckCircleOutlined />
                  必填项与审核已完成
                </div>
              ) : (
                missingItems.map((item) => (
                  <div key={item} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                    待完善：{item}
                  </div>
                ))
              )}
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-rose-700">
              <input
                type="checkbox"
                checked={seniorReviewConfirmed}
                disabled={locked}
                onChange={(event) => setSeniorReviewConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-rose-600"
              />
              上级医师已审核死亡原因、死亡诊断、抢救经过和家属告知记录
            </label>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-extrabold text-slate-800">审核提示</div>
            <ul className="mt-3 space-y-2">
              {config.auditHints.map((hint) => (
                <li key={hint} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                  <WarningOutlined className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <VersionHistoryDrawer
          open={historyOpen}
          onClose={closeHistory}
          docCode={doc.code}
          patientId={config.patient.admissionNo}
        />
      </div>
    </ParadigmShell>
  );
}
