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
  SwapOutlined,
  UserOutlined,
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
import type { ClinicalSection, FieldValue, RoundPatient, RoundVoiceSegment } from '../../services/types';
import { usePatientStore } from '../../stores/usePatientStore';
import {
  ROUND_DOC_CODES,
  ROUND_SEGMENTS,
  buildMockRoundSegment,
  buildRoundDocOptions,
  buildRoundPatients,
  type RoundDocCode,
} from './roundData';
import { buildRoundSections, getConfirmedRoundSegments, getRoundSubmitIssues } from './roundDraft';

type PreviewMode = 'read' | 'edit';

function isRoundDocCode(code: string | undefined): code is RoundDocCode {
  return code === 'DOC003' || code === 'DOC004';
}

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合查房当日体征、检验结果及治疗反应进一步补充。`;
  if (mode === 'shorten') return text.length > 36 ? `${text.slice(0, Math.ceil(text.length * 0.7))}...` : text;
  if (mode === 'polish') return text.replace(/继续看/g, '继续动态观察').replace(/好一点/g, '较前改善');
  return text;
}

function buildMetaRows(
  patient: RoundPatient,
  docName: string,
  confirmedCount: number,
): DocumentPaperMetaCell[][] {
  return [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位号', value: patient.bedNo },
      { label: '住院号', value: patient.identifiers.admissionNo },
      { label: '诊断', value: patient.diagnosis },
    ],
    [
      { label: '目标文书', value: docName },
      { label: '确认片段', value: `${confirmedCount} 条` },
      { label: '归属标识', value: '姓名 + 住院号' },
    ],
  ];
}

function patientBrief(patient: RoundPatient) {
  return {
    name: patient.name,
    gender: patient.gender,
    age: patient.age,
    bed: patient.bedNo,
    admissionNo: patient.identifiers.admissionNo,
    diagnosis: patient.diagnosis,
  };
}

function statusText(segment: RoundVoiceSegment) {
  if (!segment.patientId) return '未归属';
  return segment.status === 'confirmed' ? '已确认' : '待确认';
}

export default function RoundWorkbench() {
  const navigate = useNavigate();
  const { currentPatient, selectedDoc, selectDoc } = usePatientStore();
  const patients = useMemo(() => buildRoundPatients(currentPatient), [currentPatient]);
  const docOptions = useMemo(
    () => buildRoundDocOptions(ROUND_DOC_CODES.map((code) => getDocByCode(code))),
    [],
  );
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [docCode, setDocCode] = useState<RoundDocCode>(() => (
    isRoundDocCode(selectedDoc?.code) ? selectedDoc.code : 'DOC003'
  ));
  const [segments, setSegments] = useState<RoundVoiceSegment[]>(ROUND_SEGMENTS);
  const [sections, setSections] = useState<ClinicalSection[]>([]);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? patients[0],
    [patients, selectedPatientId],
  );
  const currentDoc = useMemo(() => getDocByCode(docCode), [docCode]);
  const docName = currentDoc?.name ?? (docCode === 'DOC004' ? '上级医师查房记录' : '日常病程记录');
  const confirmedSegments = useMemo(
    () => getConfirmedRoundSegments(segments, selectedPatient.id, docCode),
    [docCode, segments, selectedPatient.id],
  );
  const baseSections = useMemo(
    () => buildRoundSections(selectedPatient, docCode, segments),
    [docCode, segments, selectedPatient],
  );
  const submitIssues = useMemo(
    () => getRoundSubmitIssues(segments, selectedPatient.id, docCode),
    [docCode, segments, selectedPatient.id],
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
    patientId: selectedPatient.identifiers.admissionNo,
    editor: '林志远 主治医师',
  });

  useEffect(() => {
    if (!patients.some((patient) => patient.id === selectedPatientId)) {
      setSelectedPatientId(patients[0]?.id ?? '');
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    if (isRoundDocCode(selectedDoc?.code) && selectedDoc.code !== docCode) {
      setDocCode(selectedDoc.code);
    }
  }, [docCode, selectedDoc]);

  useEffect(() => {
    if (!selectedPatient.targetDocCodes.includes(docCode)) {
      const nextCode = selectedPatient.targetDocCodes[0];
      setDocCode(nextCode);
      const nextDoc = getDocByCode(nextCode);
      if (nextDoc) selectDoc(nextDoc);
    }
  }, [docCode, selectDoc, selectedPatient]);

  useEffect(() => {
    const saved = loadDraft(docCode, selectedPatient.identifiers.admissionNo);
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
    // 仅在患者或目标文书切换时恢复草稿，片段变化由“生成草稿”显式应用，避免覆盖医生编辑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docCode, selectedPatient.id, setLocked]);

  useEffect(() => {
    if (locked) return;
    const timer = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(
        sections.map((section) => [section.key, section.text]),
      );
      saveDraft({
        docCode,
        patientId: selectedPatient.identifiers.admissionNo,
        values,
        content: buildSubmitSnapshot({ sections, changeSummary: '' }).content,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [docCode, locked, sections, selectedPatient.identifiers.admissionNo]);

  const changeDoc = (nextCode: RoundDocCode) => {
    setDocCode(nextCode);
    const nextDoc = getDocByCode(nextCode);
    if (nextDoc) selectDoc(nextDoc);
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

  const updateSegment = (segmentId: string, patch: Partial<RoundVoiceSegment>) => {
    setSegments((prev) => prev.map((segment) => (
      segment.id === segmentId ? { ...segment, ...patch } : segment
    )));
  };

  const addMockSegment = () => {
    if (locked) return;
    setSegments((prev) => [
      buildMockRoundSegment(prev.length + 1, selectedPatient, docCode),
      ...prev,
    ]);
    message.success('已生成一条待确认查房语音片段。');
  };

  const confirmSegment = (segment: RoundVoiceSegment) => {
    if (!segment.patientId) {
      message.error('请先为该片段选择归属患者。');
      return;
    }
    if (!segment.revisedText.trim()) {
      message.error('片段内容为空，无法确认。');
      return;
    }
    updateSegment(segment.id, { status: 'confirmed' });
    message.success('片段已确认，可用于生成草稿。');
  };

  const deleteSegment = (segmentId: string) => {
    setSegments((prev) => prev.filter((segment) => segment.id !== segmentId));
  };

  const regenerateDraft = () => {
    if (!confirmedSegments.length) {
      message.warning('当前患者暂无已确认片段，草稿将只包含患者基础信息。');
    }
    setSections(baseSections);
    setResetKeys((prev) => Object.fromEntries(baseSections.map((section) => [
      section.key,
      (prev[section.key] ?? 0) + 1,
    ])));
    setPreviewMode('edit');
    message.success('已按当前患者、当前文书和已确认片段生成草稿。');
  };

  const doSubmit = async () => {
    const issues = getRoundSubmitIssues(segments, selectedPatient.id, docCode);
    if (issues.length) {
      message.error(issues[0]);
      return;
    }

    const snapshot = buildSubmitSnapshot({
      sections,
      changeSummary: `查房片段确认后提交${docName}`,
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
    if (submitIssues.length) {
      Modal.warning({
        title: '查房片段尚未处理完成',
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
          <p>患者 <b>{selectedPatient.name}</b>（{selectedPatient.identifiers.admissionNo}）的<b>{docName}</b>将提交。</p>
          <p className="mt-1.5 text-amber-600">仅纳入当前患者、当前文书、已确认的 {confirmedSegments.length} 条查房片段。</p>
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

  const visibleSegments = segments.filter((segment) => segment.targetDocCode === docCode);

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
                <h1 className="text-sm font-extrabold text-slate-900">查房工作台</h1>
                <span className="rounded border border-[#6D28D9]/30 bg-[#6D28D9]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#6D28D9]">
                  {docCode} {docName}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                当前患者：{selectedPatient.bedNo} {selectedPatient.name} / 住院号：{selectedPatient.identifiers.admissionNo}
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
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <FileTextOutlined className="text-[#1E3A8A]" />
              目标文书
            </div>
            <div className="grid grid-cols-1 gap-2">
              {docOptions.map((option) => {
                const disabled = !selectedPatient.targetDocCodes.includes(option.code);
                return (
                  <button
                    key={option.code}
                    onClick={() => changeDoc(option.code)}
                    disabled={disabled}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                      option.code === docCode
                        ? 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold">{option.name}</div>
                    <div className="mt-0.5 text-[10px] opacity-80">{option.code}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <UserOutlined className="text-[#1E3A8A]" />
              查房患者
            </div>
            <div className="space-y-2">
              {patients.map((patient) => {
                const active = patient.id === selectedPatient.id;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedPatientId(patient.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-[#1E3A8A] bg-[#F0F5FF] shadow-sm'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-slate-800">{patient.bedNo} {patient.name}</span>
                      <span className="text-[10px] font-bold text-slate-400">{patient.gender} {patient.age}</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{patient.diagnosis}</div>
                    <div className="mt-1 text-[10px] font-semibold text-slate-400">{patient.identifiers.admissionNo}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前查房患者「${selectedPatient.name}」不一致！防串户锁已锁定，禁止提交。`} />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)] overflow-hidden">
            <section className="min-h-0 overflow-y-auto border-r border-slate-200 bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">语音片段标注</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">片段必须绑定患者并确认后才进入草稿。</div>
                </div>
                <button
                  onClick={addMockSegment}
                  disabled={locked}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AudioOutlined />
                  模拟录音
                </button>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-bold text-slate-400">当前文书片段</div>
                  <div className="mt-0.5 text-lg font-extrabold text-slate-800">{visibleSegments.length}</div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-bold text-emerald-600">当前患者已确认</div>
                  <div className="mt-0.5 text-lg font-extrabold text-emerald-700">{confirmedSegments.length}</div>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] font-bold text-amber-600">待处理</div>
                  <div className="mt-0.5 text-lg font-extrabold text-amber-700">{submitIssues.length}</div>
                </div>
              </div>

              {submitIssues.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                  {submitIssues.map((issue) => <div key={issue}>{issue}</div>)}
                </div>
              )}

              <div className="space-y-3">
                {visibleSegments.map((segment) => {
                  const boundPatient = patients.find((patient) => patient.id === segment.patientId);
                  const activePatientSegment = segment.patientId === selectedPatient.id;
                  return (
                    <article
                      key={segment.id}
                      className={`rounded-lg border bg-white p-3 shadow-sm ${
                        activePatientSegment ? 'border-[#1E3A8A]/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-800">{segment.startedAt}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {segment.speakerRole ?? '未标注角色'}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              segment.status === 'confirmed' && segment.patientId
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {statusText(segment)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            归属：{boundPatient?.identifiers.displayName ?? '未归属患者'}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteSegment(segment.id)}
                          disabled={locked}
                          title="删除片段"
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <DeleteOutlined />
                        </button>
                      </div>

                      <textarea
                        value={segment.revisedText}
                        disabled={locked}
                        onChange={(event) => updateSegment(segment.id, {
                          revisedText: event.target.value,
                          status: 'draft',
                        })}
                        className="min-h-[78px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition-colors focus:border-[#1E3A8A] disabled:bg-slate-50"
                      />

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[10px] font-bold text-slate-500">
                          归属患者
                          <select
                            value={segment.patientId ?? ''}
                            disabled={locked}
                            onChange={(event) => updateSegment(segment.id, {
                              patientId: event.target.value || null,
                              status: 'draft',
                            })}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-[#1E3A8A]"
                          >
                            <option value="">未归属</option>
                            {patients.map((patient) => (
                              <option key={patient.id} value={patient.id}>
                                {patient.identifiers.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] font-bold text-slate-500">
                          目标文书
                          <select
                            value={segment.targetDocCode}
                            disabled={locked}
                            onChange={(event) => updateSegment(segment.id, {
                              targetDocCode: event.target.value as RoundDocCode,
                              status: 'draft',
                            })}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-[#1E3A8A]"
                          >
                            {docOptions.map((option) => (
                              <option key={option.code} value={option.code}>{option.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                          <SwapOutlined />
                          可重新归属患者或文书
                        </span>
                        <button
                          onClick={() => confirmSegment(segment)}
                          disabled={locked || segment.status === 'confirmed'}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <CheckCircleOutlined />
                          确认片段
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden bg-white">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">草稿与预览</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">只使用当前患者、当前文书、已确认片段生成。</div>
                </div>
                <div className="flex items-center gap-2">
                  {renderActionButton(<><ReloadOutlined />生成草稿</>, regenerateDraft)}
                  {previewMode === 'read'
                    ? renderActionButton(<><FileTextOutlined />编辑</>, () => setPreviewMode('edit'))
                    : renderActionButton(<><FileTextOutlined />预览</>, () => setPreviewMode('read'))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {previewMode === 'read' ? (
                  <DocumentPaper
                    docName={docName}
                    patient={patientBrief(selectedPatient)}
                    sections={sections}
                    metaRows={buildMetaRows(selectedPatient, docName, confirmedSegments.length)}
                  />
                ) : (
                  <div className="p-4">
                    <EditableDocumentPaper
                      docName={docName}
                      patient={patientBrief(selectedPatient)}
                      sections={sections}
                      metaRows={buildMetaRows(selectedPatient, docName, confirmedSegments.length)}
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
        patientId={selectedPatient.identifiers.admissionNo}
      />
    </div>
  );
}
