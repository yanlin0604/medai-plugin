import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  FileTextOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import ParadigmShell from '../../paradigms/ParadigmShell';
import type { DocDefinition } from '../../config/docRegistry';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import type { DocFieldDef, DocTemplate } from '../../services/types';
import type { FieldAssistDraft } from '../../services/fieldAssist/types';
import { generateFieldDraft } from '../../services/fieldAssist/generation';
import { applyFieldDraft } from '../../services/fieldAssist/writeback';
import { useFieldAssistStore } from '../../stores/useFieldAssistStore';
import type { Patient } from '../../stores/usePatientStore';
import { getLatestFieldAssistContext, isUsableFieldAssistContext } from '../../services/fieldAssist/contextBridge';
import type { FieldAssistContext } from '../../services/fieldAssist/types';
import { getFieldAssistSnapshotKey } from '../../services/fieldAssist/types';

interface Props {
  doc: DocDefinition;
  patient: Patient;
}

interface FieldSession {
  field: DocFieldDef;
  value: string;
  draft?: FieldAssistDraft;
  generating: boolean;
  applying: boolean;
}

const EMPTY_SESSION_META = {
  source: 'assistant-workbench',
  selectedText: '',
  prefix: '',
  selectionStart: 0,
  selectionEnd: 0,
  trigger: 'focus',
  sessionId: 'full-document',
  writebackUrl: '',
  detectedAt: '',
  receivedAt: '',
} as const;
const FIELD_CONTEXT_POLL_MS = 1800;

function valueToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object' && 'name' in item) {
          const name = String((item as { name?: unknown }).name ?? '');
          const code = String((item as { code?: unknown }).code ?? '');
          return code ? `${name} ${code}` : name;
        }
        return String(item);
      })
      .filter(Boolean)
      .join('；');
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return valueToText((value as { value?: unknown }).value);
  }
  return value == null ? '' : String(value);
}

function buildInitialSessions(template: DocTemplate, values: Record<string, unknown>): FieldSession[] {
  return template.fields.map((field) => ({
    field,
    value: valueToText(values[field.key] ?? field.default ?? field.staticText ?? ''),
    generating: false,
    applying: false,
  }));
}

function mergeLatestDraftsIntoSessions(
  sessions: FieldSession[],
  drafts: FieldAssistDraft[],
  patientId: string,
  docCode: string,
): FieldSession[] {
  const latestByField = new Map<string, FieldAssistDraft>();

  drafts.forEach((draft) => {
    const response = draft.response;
    if (response.patientId !== patientId || response.docCode !== docCode || !response.fieldKey) return;

    const current = latestByField.get(response.fieldKey);
    if (!current || Date.parse(draft.createdAt) > Date.parse(current.createdAt)) {
      latestByField.set(response.fieldKey, draft);
    }
  });

  if (!latestByField.size) return sessions;

  return sessions.map((session) => {
    const draft = latestByField.get(session.field.key);
    if (!draft) return session;

    return {
      ...session,
      draft,
      value: draft.generatedText || draft.response.generatedText || session.value,
    };
  });
}

function buildContext(
  doc: DocDefinition,
  patient: Patient,
  session: FieldSession,
  instruction?: string,
) {
  return {
    ...EMPTY_SESSION_META,
    patientId: patient.id,
    patientName: patient.name,
    docCode: doc.code,
    docName: doc.name,
    fieldKey: session.field.key,
    fieldLabel: session.field.label,
    fieldValue: session.value,
    detectedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    sessionId: `full-document:${doc.code}:${patient.id}:${session.field.key}`,
    trigger: instruction ? 'input' : 'focus',
  };
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STANDARD_META_FIELD_KEYS = new Set(['admissionDate', 'dischargeDate', 'hospitalDays']);
const STANDARD_META_FIELD_LABELS = new Set(['入院日期', '出院日期', '住院天数']);
const TOP_META_SLOTS = new Set(['patient', 'date']);

function isTopWorkbenchField(field: DocFieldDef): boolean {
  if (field.metaSlot && TOP_META_SLOTS.has(field.metaSlot)) return true;
  return STANDARD_META_FIELD_KEYS.has(field.key)
    || STANDARD_META_FIELD_LABELS.has(field.label)
    || STANDARD_META_FIELD_LABELS.has(field.section);
}

function compactTopMetaItems(topSessions: FieldSession[]) {
  const patientLabels = new Set(['姓名', '性别', '年龄', '住院号']);
  const seen = new Set(patientLabels);
  return topSessions
    .map((session) => ({ label: session.field.label, value: session.value || '待同步' }))
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    });
}

export default function UnifiedDocWorkspace({ doc, patient }: Props) {
  const addDraft = useFieldAssistStore((state) => state.addDraft);
  const drafts = useFieldAssistStore((state) => state.drafts);
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [sessions, setSessions] = useState<FieldSession[]>([]);
  const [fieldContext, setFieldContext] = useState<FieldAssistContext | null>(null);
  const [activeFieldKey, setActiveFieldKey] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestFieldSnapshotKeyRef = useRef('');
  const voiceTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const fieldCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const topSessions = useMemo(
    () => sessions.filter((session) => isTopWorkbenchField(session.field)),
    [sessions],
  );
  const bodySessions = useMemo(
    () => sessions.filter((session) => !isTopWorkbenchField(session.field)),
    [sessions],
  );
  const activeSession = useMemo(
    () => bodySessions.find((session) => session.field.key === activeFieldKey) ?? bodySessions[0] ?? null,
    [activeFieldKey, bodySessions],
  );
  const topMetaItems = useMemo(
    () => compactTopMetaItems(topSessions),
    [topSessions],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      pluginRuntimeApi.getRuntimeDocTemplate(doc.code),
      pluginRuntimeApi.resolveRuntimeValues(doc.code, patient.id, false),
    ]).then(([nextTemplate, values]) => {
      if (cancelled) return;
      setTemplate(nextTemplate);
      const nextSessions = mergeLatestDraftsIntoSessions(
        buildInitialSessions(nextTemplate, values.values ?? {}),
        useFieldAssistStore.getState().drafts,
        patient.id,
        doc.code,
      );
      setSessions(nextSessions);
      setActiveFieldKey(nextSessions.find((session) => !isTopWorkbenchField(session.field))?.field.key ?? '');
      setVoiceText('');
      setVoicePanelOpen(false);
      setRecording(false);
      setLoading(false);
    }).catch((loadError) => {
      if (cancelled) return;
      setError(loadError instanceof Error ? loadError.message : '文书字段加载失败');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [doc.code, patient.id]);

  useEffect(() => {
    setSessions((current) => mergeLatestDraftsIntoSessions(current, drafts, patient.id, doc.code));
  }, [doc.code, drafts, patient.id]);

  useEffect(() => () => {
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!bodySessions.length) {
      if (activeFieldKey) setActiveFieldKey('');
      return;
    }
    if (!bodySessions.some((session) => session.field.key === activeFieldKey)) {
      setActiveFieldKey(bodySessions[0].field.key);
    }
  }, [activeFieldKey, bodySessions]);

  useEffect(() => {
    let disposed = false;

    const pollFieldContext = async () => {
      const nextContext = await getLatestFieldAssistContext();
      if (disposed) return;

      const usableContext = isUsableFieldAssistContext(nextContext) ? nextContext : null;
      if (!usableContext || usableContext.docCode !== doc.code || usableContext.patientId !== patient.id) {
        if (latestFieldSnapshotKeyRef.current) {
          latestFieldSnapshotKeyRef.current = '';
          setFieldContext(null);
        }
        return;
      }

      const nextSnapshotKey = getFieldAssistSnapshotKey(usableContext);
      if (nextSnapshotKey === latestFieldSnapshotKeyRef.current) return;

      latestFieldSnapshotKeyRef.current = nextSnapshotKey;
      setFieldContext(usableContext);
    };

    void pollFieldContext();
    const timer = window.setInterval(() => {
      void pollFieldContext();
    }, FIELD_CONTEXT_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [doc.code, patient.id]);

  const updateSession = (fieldKey: string, updater: (session: FieldSession) => FieldSession) => {
    setSessions((current) => current.map((session) => (
      session.field.key === fieldKey ? updater(session) : session
    )));
  };

  const handleGenerate = async (fieldKey: string, instruction?: string, transcriptText?: string) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    if (!session || session.generating) return;
    const activeContext = fieldContext?.fieldKey === fieldKey ? fieldContext : null;

    updateSession(fieldKey, (item) => ({ ...item, generating: true }));
    try {
      const draft = await generateFieldDraft(activeContext ?? buildContext(doc, patient, session, instruction), instruction, transcriptText);
      addDraft(draft);
      updateSession(fieldKey, (item) => ({
        ...item,
        draft,
        value: draft.generatedText || draft.response.generatedText,
      }));
      if (fieldKey === activeFieldKey) {
        setVoiceText('');
        setVoicePanelOpen(false);
        setRecording(false);
      }
      message.success(`已生成${session.field.label}`);
    } catch (generateError) {
      message.error(generateError instanceof Error ? generateError.message : '字段生成失败');
    } finally {
      updateSession(fieldKey, (item) => ({ ...item, generating: false }));
    }
  };

  const handleVoiceSend = () => {
    if (!activeSession) {
      message.warning('请先选择一个正文编辑字段。');
      return;
    }
    if (!voiceText.trim()) {
      message.warning('请先确认语音转写文本。');
      return;
    }
    void handleGenerate(activeSession.field.key, `根据语音转写生成${activeSession.field.label}`, voiceText.trim());
  };

  const closeVoicePanel = () => {
    if (voiceTimerRef.current) {
      window.clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    setRecording(false);
    setVoicePanelOpen(false);
  };

  const scrollToField = (fieldKey: string) => {
    window.setTimeout(() => {
      fieldCardRefs.current[fieldKey]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    }, 0);
  };

  const handleVoiceTextChange = (nextText: string) => {
    setVoiceText(nextText);
    if (!activeSession) return;
    updateSession(activeSession.field.key, (item) => ({
      ...item,
      value: nextText,
    }));
  };

  const handleToggleRecording = () => {
    if (!activeSession) {
      message.warning('请先选择一个正文编辑字段。');
      return;
    }

    if (voicePanelOpen) {
      closeVoicePanel();
      return;
    }

    const targetFieldKey = activeSession.field.key;
    const transcriptText = `请根据医生口述补充${activeSession.field.label}。`;
    setVoicePanelOpen(true);
    setRecording(true);
    message.loading({ content: `正在采集「${activeSession.field.label}」语音...`, key: 'doc-workspace-voice' });
    voiceTimerRef.current = window.setTimeout(() => {
      setRecording(false);
      setVoiceText(transcriptText);
      updateSession(targetFieldKey, (item) => ({
        ...item,
        value: transcriptText,
      }));
      voiceTimerRef.current = null;
      message.success({ content: '语音转文字已生成，请确认后生成字段。', key: 'doc-workspace-voice', duration: 1.5 });
    }, 1200);
  };

  const handleApply = async (fieldKey: string) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    if (!session || session.applying) return;
    if (!session.draft) {
      message.warning(`请先生成「${session.field.label}」字段草稿，再执行回填。`);
      return;
    }
    if (!fieldContext || fieldContext.fieldKey !== fieldKey) {
      message.warning(`请先在 CS 端聚焦「${session.field.label}」字段，再执行回填。`);
      return;
    }

    updateSession(fieldKey, (item) => ({ ...item, applying: true }));
    try {
      await applyFieldDraft({
        context: fieldContext,
        response: session.draft.response,
        finalText: session.value,
        mode: 'fill',
        doctorName: patient.doctor,
      });
      message.success(`已回填${session.field.label}`);
    } catch (applyError) {
      message.error(applyError instanceof Error ? applyError.message : '字段回填失败');
    } finally {
      updateSession(fieldKey, (item) => ({ ...item, applying: false }));
    }
  };

  if (loading || error || !template) {
    return (
      <ParadigmShell doc={doc} showParadigmBadge={false} showPatientId={false}>
        <div className="flex h-full flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center">
          <FileTextOutlined className="text-2xl text-[#1E3A8A]" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">
            {loading ? '正在加载文书字段' : '文书字段不可用'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {loading ? '正在读取模板和已有字段内容。' : error}
          </p>
        </div>
      </ParadigmShell>
    );
  }

  return (
    <ParadigmShell doc={doc} showParadigmBadge={false} showPatientId={false}>
      <main className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
        <section className="border-b border-slate-200 bg-white px-4 py-1.5">
          <div className="mx-auto flex max-w-[980px] items-center gap-x-3 overflow-hidden whitespace-nowrap text-[11px] leading-5 text-slate-500">
            <span className="shrink-0 font-semibold text-slate-700">{patient.name}</span>
            <span className="shrink-0">{patient.gender} {patient.age}</span>
            <span className="shrink-0">住院号 {patient.id}</span>
            {patient.bedNo ? <span className="shrink-0">{patient.bedNo}</span> : null}
            {topMetaItems.map((item) => (
              <span key={item.label} className="shrink-0">{item.label} {item.value}</span>
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-3">
          <div className="mx-auto flex max-w-[980px] flex-col gap-4">
            {bodySessions.map((session) => {
              const hasDraft = Boolean(session.draft);
              const canWriteback = Boolean(hasDraft && fieldContext?.fieldKey === session.field.key);
              const generatedAt = formatTime(session.draft?.createdAt);
              const active = activeSession?.field.key === session.field.key;
              return (
                <article
                  key={session.field.key}
                  ref={(element) => {
                    fieldCardRefs.current[session.field.key] = element;
                  }}
                  onClick={() => {
                    if (session.field.key !== activeFieldKey) {
                      closeVoicePanel();
                      setVoiceText('');
                    }
                    setActiveFieldKey(session.field.key);
                  }}
                  className={[
                    'rounded-lg border bg-white shadow-sm transition-colors',
                    active ? 'border-[#1E3A8A] ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800">
                        <span className="truncate">{session.field.label}</span>
                        {active ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#1E3A8A]">当前编辑</span>
                        ) : null}
                        {session.field.required ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">必填</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                        {hasDraft ? `最近生成 ${generatedAt}` : `来源 ${session.field.source}`}
                        {fieldContext?.fieldKey === session.field.key ? ' · CS 当前字段' : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveFieldKey(session.field.key);
                          void handleGenerate(session.field.key, `生成${session.field.label}`);
                        }}
                        disabled={session.generating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {session.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                        {hasDraft ? '重新生成' : '生成'}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleApply(session.field.key);
                        }}
                        disabled={session.applying}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        title={canWriteback ? '回填到 CS 当前字段' : '点击查看回填条件'}
                      >
                        {session.applying ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                        回填
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 px-3 py-3">
                    <div className="max-w-[92%] rounded-lg rounded-bl-sm border border-slate-200 bg-[#FBFDFF] px-3 py-2 text-sm leading-6 text-slate-800">
                      {session.value || <span className="text-slate-400">这个字段还没有内容。</span>}
                    </div>
                  </div>
                </article>
              );
            })}

            {/* <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-700">
              <CheckCircleOutlined className="mr-1" />
              当前页面按文书字段顺序展示，回填始终是单字段回填，不覆盖整篇。
            </div> */}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <div className="mx-auto max-w-[980px]">
            {voicePanelOpen ? (
              <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[11px] font-bold text-[#1E3A8A]">
                    {recording ? '正在语音转文字' : '语音转文字'}：{activeSession?.field.label ?? '未选择字段'}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {voiceText ? (
                      <button
                        type="button"
                        onClick={() => handleVoiceTextChange('')}
                        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-slate-700"
                      >
                        <CloseOutlined />
                        清空
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeVoicePanel}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] text-slate-400 hover:bg-white hover:text-slate-700"
                      title="收起语音转文字"
                      aria-label="收起语音转文字"
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                </div>
                <textarea
                  value={voiceText}
                  onChange={(event) => handleVoiceTextChange(event.target.value)}
                  className="h-16 w-full resize-none rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1E3A8A]"
                  placeholder={recording ? '正在听写，转写结果稍后显示...' : '语音转文字结果会显示在这里'}
                  disabled={!activeSession}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-[minmax(118px,1fr)_auto_auto] items-center gap-2">
            <div className="min-w-0">
              <select
                value={activeSession?.field.key ?? ''}
                onChange={(event) => {
                  const nextFieldKey = event.target.value;
                  closeVoicePanel();
                  setVoiceText('');
                  setActiveFieldKey(nextFieldKey);
                  scrollToField(nextFieldKey);
                }}
                title="语音写入字段"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1E3A8A]"
              >
                {bodySessions.map((session) => (
                  <option key={session.field.key} value={session.field.key}>{session.field.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleToggleRecording}
              disabled={!activeSession}
              className={[
                'inline-flex h-11 min-w-[88px] items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold disabled:opacity-50',
                recording
                  ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                  : 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A] hover:bg-[#DBEAFE]',
              ].join(' ')}
              title="语音输入"
              aria-label="语音输入"
            >
              <AudioOutlined className={recording ? 'animate-pulse' : undefined} />
              <span className="hidden sm:inline">{voicePanelOpen ? '收起' : '语音'}</span>
            </button>
            <button
              type="button"
              onClick={handleVoiceSend}
              disabled={!activeSession || !voicePanelOpen || !voiceText.trim() || activeSession.generating}
              className="inline-flex h-11 min-w-[92px] items-center justify-center gap-2 rounded-md bg-[#1E3A8A] px-4 text-sm font-bold text-white hover:bg-[#172554] disabled:opacity-50"
            >
              {activeSession?.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <SendOutlined />}
              <span className="hidden sm:inline">生成</span>
            </button>
            </div>
          </div>
        </section>
      </main>
    </ParadigmShell>
  );
}
