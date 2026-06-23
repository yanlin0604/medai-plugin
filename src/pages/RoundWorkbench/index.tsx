import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
  TeamOutlined,
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
  buildRoundDocOptions,
  buildRoundPatients,
  type RoundDocCode,
} from './roundData';
import { buildRoundSections, getConfirmedRoundSegments, getRoundSubmitIssues } from './roundDraft';

type PreviewMode = 'read' | 'edit';

const ROUND_TEAM = [
  { name: '王建国', role: '主任医师', voiceprint: '已建声纹' },
  { name: '林志远', role: '主治医师', voiceprint: '已建声纹' },
  { name: '赵敏', role: '住院医师', voiceprint: '待复核' },
  { name: '刘倩', role: '责任护士', voiceprint: '可选参与' },
];

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

function getTimeLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
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
    isRoundDocCode(selectedDoc?.code) ? selectedDoc.code : 'DOC004'
  ));
  const [segments, setSegments] = useState<RoundVoiceSegment[]>(ROUND_SEGMENTS);
  const [sections, setSections] = useState<ClinicalSection[]>([]);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [recording, setRecording] = useState(true);
  const [routeMarks, setRouteMarks] = useState<Array<{ patientId: string; markedAt: string; method: string }>>([]);
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? patients[0],
    [patients, selectedPatientId],
  );
  const currentDoc = useMemo(() => getDocByCode(docCode), [docCode]);
  const docName = currentDoc?.name ?? (docCode === 'DOC004' ? '查房记录' : '日常病程记录');
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
  const currentPatientIndex = patients.findIndex((patient) => patient.id === selectedPatient.id);
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

  const markCurrentPatient = (method = '手动床位标记') => {
    const markedAt = getTimeLabel();
    setRouteMarks((prev) => [
      { patientId: selectedPatient.id, markedAt, method },
      ...prev,
    ].slice(0, 8));
    message.success(`已标记 ${selectedPatient.bedNo} ${selectedPatient.name}，后续录音优先归属该患者。`);
  };

  const switchToPatient = (patientId: string, shouldMark = true) => {
    setSelectedPatientId(patientId);
    const nextPatient = patients.find((patient) => patient.id === patientId);
    if (!nextPatient || !shouldMark) return;
    const markedAt = getTimeLabel();
    setRouteMarks((prev) => [
      { patientId, markedAt, method: '下一位患者' },
      ...prev,
    ].slice(0, 8));
  };

  const goNextPatient = () => {
    if (!patients.length) return;
    const nextIndex = currentPatientIndex >= 0 ? (currentPatientIndex + 1) % patients.length : 0;
    switchToPatient(patients[nextIndex].id);
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

  const latestMarks = routeMarks.length
    ? routeMarks
    : [{ patientId: selectedPatient.id, markedAt: getTimeLabel(), method: '当前床位' }];

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
              <EnvironmentOutlined className="text-[#1E3A8A]" />
              查房任务
            </div>
            <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">呼吸内科 A 区</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    {patients.length} 名患者 · 按床位顺序查房
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  recording ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                }`}
                >
                  {recording ? '录音中' : '已暂停'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecording((prev) => !prev)}
                  className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-white ${
                    recording ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#1E3A8A] hover:bg-[#172554]'
                  }`}
                >
                  {recording ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  {recording ? '暂停' : '继续'}
                </button>
                <button
                  type="button"
                  onClick={goNextPatient}
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-[#1E3A8A]/20 bg-white px-2 py-1.5 text-[11px] font-bold text-[#1E3A8A] hover:bg-[#F0F5FF]"
                >
                  <SwapOutlined />
                  下一位
                </button>
              </div>
              <button
                type="button"
                onClick={() => markCurrentPatient()}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <EnvironmentOutlined />
                标记当前床位
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <TeamOutlined className="text-[#1E3A8A]" />
              医护说话人
            </div>
            <div className="space-y-1.5">
              {ROUND_TEAM.map((member) => (
                <div key={`${member.name}-${member.role}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-slate-800">{member.name}</div>
                    <div className="text-[10px] font-semibold text-slate-400">{member.role}</div>
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    {member.voiceprint}
                  </span>
                </div>
              ))}
            </div>
          </div>

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
                    onClick={() => switchToPatient(patient.id)}
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
              <div className="mb-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <ClockCircleOutlined className="text-[#1E3A8A]" />
                      床位标记时间线
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">主归属依据</span>
                  </div>
                  <div className="space-y-1.5">
                    {latestMarks.slice(0, 3).map((mark, index) => {
                      const patient = patients.find((item) => item.id === mark.patientId);
                      return (
                        <div key={`${mark.patientId}-${mark.markedAt}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-[#F8FAFC] px-2.5 py-1.5">
                          <span className="truncate text-[11px] font-bold text-slate-700">
                            {mark.markedAt} · {patient?.bedNo ?? '--'} {patient?.name ?? '未知患者'}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400">{mark.method}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">查房内容</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">系统按床位时间线自动整理到当前患者草稿。</div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-bold text-emerald-600">已纳入当前患者</div>
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
                {confirmedSegments.map((segment) => {
                  return (
                    <article
                      key={segment.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-800">{segment.startedAt}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {segment.speakerRole ?? '未标注角色'}
                            </span>
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              已整理
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs leading-relaxed text-slate-700">
                        {segment.revisedText}
                      </p>
                    </article>
                  );
                })}
                {!confirmedSegments.length && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400">
                    当前患者暂无已整理内容，查房后可直接生成草稿。
                  </div>
                )}
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
