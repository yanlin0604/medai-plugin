import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import EditableDocumentPaper from '../../components/clinical/EditableDocumentPaper';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import WritebackBar from '../../components/clinical/WritebackBar';
import { getDocByCode } from '../../config/docRegistry';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { useHotkey } from '../../hooks/useHotkey';
import { buildSubmitLabel, buildSubmitSnapshot } from '../../services/documentFlow';
import { loadDraft, saveDraft } from '../../services/draftService';
import type { ClinicalSection, FieldValue, MeetingVoiceSegment } from '../../services/types';
import { usePatientStore } from '../../stores/usePatientStore';
import {
  MEETING_DOC_CODES,
  buildMeetingConfigs,
  buildMeetingDocOptions,
  buildMockMeetingSegment,
  type MeetingDocCode,
} from './meetingData';
import { buildMeetingSections, getMeetingSubmitIssues } from './meetingDraft';

type PreviewMode = 'read' | 'edit';

function isMeetingDocCode(code: string | undefined): code is MeetingDocCode {
  return code === 'DOC005' || code === 'DOC012';
}

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合会议发言、病程记录和检查结果进一步补充依据。`;
  if (mode === 'shorten') return text.length > 36 ? `${text.slice(0, Math.ceil(text.length * 0.7))}...` : text;
  if (mode === 'polish') return text.replace(/要/g, '需').replace(/不能/g, '不得');
  return text;
}

function buildMetaRows(
  docName: string,
  patientName: string,
  patientInfo: string,
  meetingTime: string,
  host: string,
): DocumentPaperMetaCell[][] {
  return [
    [
      { label: '目标文书', value: docName },
      { label: '会议时间', value: meetingTime },
      { label: '主持人', value: host },
    ],
    [
      { label: '关联患者', value: patientName },
      { label: '患者标识', value: patientInfo },
      { label: '记录类型', value: '会议讨论' },
    ],
  ];
}

function statusText(segment: MeetingVoiceSegment) {
  return segment.status === 'confirmed' ? '已确认' : '待确认';
}

export default function Meeting() {
  const navigate = useNavigate();
  const { currentPatient, selectedDoc, selectDoc } = usePatientStore();
  const configs = useMemo(() => buildMeetingConfigs(currentPatient), [currentPatient]);
  const docOptions = useMemo(
    () => buildMeetingDocOptions(MEETING_DOC_CODES.map((code) => getDocByCode(code))),
    [],
  );
  const [docCode, setDocCode] = useState<MeetingDocCode>(() => (
    isMeetingDocCode(selectedDoc?.code) ? selectedDoc.code : 'DOC005'
  ));
  const [segmentsByDoc, setSegmentsByDoc] = useState<Record<MeetingDocCode, MeetingVoiceSegment[]>>(() => ({
    DOC005: buildMeetingConfigs(null).DOC005.initialSegments,
    DOC012: buildMeetingConfigs(null).DOC012.initialSegments,
  }));
  const [conclusionConfirmedByDoc, setConclusionConfirmedByDoc] = useState<Record<MeetingDocCode, boolean>>({
    DOC005: true,
    DOC012: false,
  });
  const [sections, setSections] = useState<ClinicalSection[]>([]);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const config = configs[docCode];
  const segments = segmentsByDoc[docCode];
  const currentDoc = useMemo(() => getDocByCode(docCode), [docCode]);
  const docName = currentDoc?.name ?? config.title;
  const conclusionConfirmed = conclusionConfirmedByDoc[docCode];
  const baseSections = useMemo(
    () => buildMeetingSections(config, segments),
    [config, segments],
  );
  const submitIssues = useMemo(
    () => getMeetingSubmitIssues(config, segments, conclusionConfirmed),
    [config, conclusionConfirmed, segments],
  );
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
    docCode,
    docName,
    patientId: config.patientId,
    editor: '林志远 主治医师',
  });

  useEffect(() => {
    if (isMeetingDocCode(selectedDoc?.code) && selectedDoc.code !== docCode) {
      setDocCode(selectedDoc.code);
    }
  }, [docCode, selectedDoc]);

  useEffect(() => {
    const saved = loadDraft(docCode, config.patientId);
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
    setPreviewMode('read');
    // 仅在文书或患者切换时恢复草稿，发言片段变化由“生成草稿”显式应用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.patientId, docCode, setLocked]);

  useEffect(() => {
    if (locked) return;
    const timer = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(
        sections.map((section) => [section.key, section.text]),
      );
      saveDraft({
        docCode,
        patientId: config.patientId,
        values,
        content: buildSubmitSnapshot({ sections, changeSummary: '' }).content,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [config.patientId, docCode, locked, sections]);

  const changeDoc = (nextCode: MeetingDocCode) => {
    setDocCode(nextCode);
    const nextDoc = getDocByCode(nextCode);
    if (nextDoc) selectDoc(nextDoc);
  };

  const updateSegments = (updater: (prev: MeetingVoiceSegment[]) => MeetingVoiceSegment[]) => {
    setSegmentsByDoc((prev) => ({ ...prev, [docCode]: updater(prev[docCode]) }));
  };

  const updateSegment = (segmentId: string, patch: Partial<MeetingVoiceSegment>) => {
    updateSegments((prev) => prev.map((segment) => (
      segment.id === segmentId ? { ...segment, ...patch } : segment
    )));
  };

  const addMockSegment = () => {
    if (locked) return;
    updateSegments((prev) => [
      buildMockMeetingSegment(prev.length + 1, config),
      ...prev,
    ]);
    message.success('已生成一条待确认会议发言。');
  };

  const confirmSegment = (segment: MeetingVoiceSegment) => {
    if (!segment.speakerName.trim()) {
      message.error('请先填写发言人。');
      return;
    }
    if (!segment.revisedText.trim()) {
      message.error('发言内容为空，无法确认。');
      return;
    }
    updateSegment(segment.id, { status: 'confirmed' });
    message.success('发言已确认，可用于生成草稿。');
  };

  const deleteSegment = (segmentId: string) => {
    updateSegments((prev) => prev.filter((segment) => segment.id !== segmentId));
  };

  const updateSection = (sectionKey: string, text: string) => {
    setSections((prev) => prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)));
  };

  const resetSection = (sectionKey: string) => {
    const base = baseSections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    setResetKeys((prev) => ({ ...prev, [sectionKey]: (prev[sectionKey] ?? 0) + 1 }));
  };

  const regenerateDraft = () => {
    setSections(baseSections);
    setResetKeys((prev) => Object.fromEntries(baseSections.map((section) => [
      section.key,
      (prev[section.key] ?? 0) + 1,
    ])));
    setPreviewMode('edit');
    message.success('已按已确认会议发言生成草稿。');
  };

  const setConclusionConfirmed = (checked: boolean) => {
    setConclusionConfirmedByDoc((prev) => ({ ...prev, [docCode]: checked }));
  };

  const doSubmit = async () => {
    const issues = getMeetingSubmitIssues(config, segments, conclusionConfirmed);
    const emptyRequired = sections.filter((section) => section.required && !section.text.trim());
    if (issues.length) {
      message.error(issues[0]);
      return;
    }
    if (emptyRequired.length) {
      message.error(`请先完善：${emptyRequired.map((section) => section.title).join('、')}`);
      return;
    }

    const snapshot = buildSubmitSnapshot({
      sections,
      changeSummary: `会议讨论确认后提交${docName}`,
      includeEmptySections: true,
    });
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
    if (submitIssues.length) {
      Modal.warning({
        title: '会议内容尚未处理完成',
        width: 420,
        content: (
          <div className="space-y-1.5 text-[12px] leading-relaxed text-slate-600">
            {submitIssues.map((issue) => <p key={issue}>{issue}</p>)}
          </div>
        ),
      });
      return;
    }

    Modal.confirm({
      title: `确认提交${docName}？`,
      width: 420,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p><b>{docName}</b>将按关联患者 {config.patient.name}（{config.patientId}）提交。</p>
          {config.conclusionRequiresManualConfirm && (
            <p className="mt-1.5 text-rose-600">死亡讨论结论已由主持医师人工确认。</p>
          )}
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
    <div className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate('/')}
              title="返回文书选择中心"
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <ArrowLeftOutlined />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-extrabold text-slate-900">会议讨论</h1>
                <span className="rounded border border-[#6D28D9]/30 bg-[#6D28D9]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#6D28D9]">
                  {docCode} {docName}
                </span>
                {config.conclusionRequiresManualConfirm && (
                  <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                    人工确认
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                关联患者：{config.patient.bed} {config.patient.name} / 住院号：{config.patientId}
              </p>
            </div>
          </div>
          {renderActionButton(
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[292px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <FileTextOutlined className="text-[#1E3A8A]" />
              目标文书
            </div>
            <div className="grid grid-cols-1 gap-2">
              {docOptions.map((option) => (
                <button
                  key={option.code}
                  onClick={() => changeDoc(option.code)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                    option.code === docCode
                      ? 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-extrabold">{option.name}</div>
                  <div className="mt-0.5 text-[10px] opacity-80">{option.code}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <TeamOutlined className="text-[#1E3A8A]" />
              会议概要
            </div>
            <div className="space-y-2 text-[11px] leading-relaxed text-slate-600">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <b className="text-slate-800">{config.title}</b>
                <div className="mt-1">{config.meetingTime}</div>
                <div>{config.location}</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                主持人：{config.host}
                <div className="mt-1 text-slate-400">
                  {config.participants.map((person) => `${person.name}/${person.role}`).join('、')}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="mb-2 text-xs font-bold text-slate-700">讨论主题</div>
            <div className="space-y-2">
              {config.topics.map((topic) => (
                <div key={topic.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs font-extrabold text-slate-800">{topic.title}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{topic.focus}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前会议关联患者「${config.patient.name}」不一致！防串户锁已锁定，禁止提交。`} />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)] overflow-hidden">
            <section className="min-h-0 overflow-y-auto border-r border-slate-200 bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">会议转写片段</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">发言按主题归类，确认后进入草稿。</div>
                </div>
                <button
                  onClick={addMockSegment}
                  disabled={locked}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AudioOutlined />
                  模拟转写
                </button>
              </div>

              {config.riskNotice && (
                <div className="mb-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
                  <WarningOutlined className="mt-0.5 shrink-0" />
                  {config.riskNotice}
                </div>
              )}

              {submitIssues.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                  {submitIssues.map((issue) => <div key={issue}>{issue}</div>)}
                </div>
              )}

              <div className="space-y-3">
                {segments.map((segment) => (
                  <article key={segment.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-800">{segment.speakerName}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            {segment.speakerRole}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            segment.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {statusText(segment)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          主题：{config.topics.find((topic) => topic.key === segment.topicKey)?.title ?? segment.topicKey}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteSegment(segment.id)}
                        disabled={locked}
                        title="删除发言"
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <DeleteOutlined />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <input
                        value={segment.speakerName}
                        disabled={locked}
                        onChange={(event) => updateSegment(segment.id, {
                          speakerName: event.target.value,
                          status: 'draft',
                        })}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-[#1E3A8A]"
                      />
                      <input
                        value={segment.speakerRole}
                        disabled={locked}
                        onChange={(event) => updateSegment(segment.id, {
                          speakerRole: event.target.value,
                          status: 'draft',
                        })}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-[#1E3A8A]"
                      />
                      <select
                        value={segment.topicKey}
                        disabled={locked}
                        onChange={(event) => updateSegment(segment.id, {
                          topicKey: event.target.value,
                          status: 'draft',
                        })}
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-[#1E3A8A]"
                      >
                        {config.topics.map((topic) => (
                          <option key={topic.key} value={topic.key}>{topic.title}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      value={segment.revisedText}
                      disabled={locked}
                      onChange={(event) => updateSegment(segment.id, {
                        revisedText: event.target.value,
                        status: 'draft',
                      })}
                      className="mt-2 min-h-[84px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition-colors focus:border-[#1E3A8A] disabled:bg-slate-50"
                    />

                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => confirmSegment(segment)}
                        disabled={locked || segment.status === 'confirmed'}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <CheckCircleOutlined />
                        确认发言
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden bg-white">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">草稿与预览</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">按已确认发言生成，结论由医生核对。</div>
                </div>
                <div className="flex items-center gap-2">
                  {renderActionButton(<><ReloadOutlined />生成草稿</>, regenerateDraft)}
                  {previewMode === 'read'
                    ? renderActionButton(<><FileTextOutlined />编辑</>, () => setPreviewMode('edit'))
                    : renderActionButton(<><FileTextOutlined />预览</>, () => setPreviewMode('read'))}
                </div>
              </div>

              {config.conclusionRequiresManualConfirm && (
                <label className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700">
                  <input
                    type="checkbox"
                    checked={conclusionConfirmed}
                    disabled={locked}
                    onChange={(event) => setConclusionConfirmed(event.target.checked)}
                    className="h-4 w-4 accent-rose-600"
                  />
                  主持医师已人工确认死亡讨论结论
                </label>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {previewMode === 'read' ? (
                  <DocumentPaper
                    docName={docName}
                    patient={config.patient}
                    sections={sections}
                    metaRows={buildMetaRows(
                      docName,
                      config.patient.name,
                      `${config.patient.bed} / ${config.patientId}`,
                      config.meetingTime,
                      config.host,
                    )}
                  />
                ) : (
                  <div className="p-4">
                    <EditableDocumentPaper
                      docName={docName}
                      patient={config.patient}
                      sections={sections}
                      metaRows={buildMetaRows(
                        docName,
                        config.patient.name,
                        `${config.patient.bed} / ${config.patientId}`,
                        config.meetingTime,
                        config.host,
                      )}
                      locked={locked}
                      resetKeys={resetKeys}
                      onChange={updateSection}
                      onReset={resetSection}
                      optimize={optimizeText}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>

          <WritebackBar
            label={buildSubmitLabel(docName)}
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
      </div>

      <VersionHistoryDrawer
        open={historyOpen}
        onClose={closeHistory}
        docCode={docCode}
        patientId={config.patientId}
      />
    </div>
  );
}
