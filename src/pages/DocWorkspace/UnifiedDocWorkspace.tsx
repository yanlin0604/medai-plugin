import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioOutlined,
  CheckCircleOutlined,
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
import type { DocFieldDef, DocTemplate, PatientBrief } from '../../services/types';
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
  instruction: string;
  voiceText: string;
  voiceOpen: boolean;
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

function toPatientBrief(patient: Patient): PatientBrief {
  return {
    name: patient.name,
    gender: patient.gender,
    age: patient.age,
    bed: patient.bedNo,
    admissionNo: patient.id,
    diagnosis: patient.diagnosis,
  };
}

function valueToText(value: unknown): string {
  if (typeof value === 'string') return value;
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
  return value == null ? '' : String(value);
}

function buildInitialSessions(template: DocTemplate, values: Record<string, unknown>): FieldSession[] {
  return template.fields.map((field) => ({
    field,
    value: valueToText(values[field.key] ?? field.default ?? field.staticText ?? ''),
    instruction: '',
    voiceText: '',
    voiceOpen: false,
    generating: false,
    applying: false,
  }));
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

export default function UnifiedDocWorkspace({ doc, patient }: Props) {
  const addDraft = useFieldAssistStore((state) => state.addDraft);
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [sessions, setSessions] = useState<FieldSession[]>([]);
  const [fieldContext, setFieldContext] = useState<FieldAssistContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestFieldSnapshotKeyRef = useRef('');
  const patientBrief = useMemo(() => toPatientBrief(patient), [patient]);

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
      setSessions(buildInitialSessions(nextTemplate, values.values ?? {}));
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
        instruction: '',
        value: draft.generatedText || draft.response.generatedText,
      }));
      message.success(`已生成${session.field.label}`);
    } catch (generateError) {
      message.error(generateError instanceof Error ? generateError.message : '字段生成失败');
    } finally {
      updateSession(fieldKey, (item) => ({ ...item, generating: false }));
    }
  };

  const handleApply = async (fieldKey: string) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    if (!session?.draft || session.applying) return;
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
        <section className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-bold text-[#1E3A8A]">全文字段工作台</div>
          <h2 className="mt-1 truncate text-[17px] font-extrabold text-slate-900">{template.title || doc.name}</h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{patientBrief.name}</span>
            <span>{patientBrief.gender} {patientBrief.age}</span>
            <span>住院号 {patientBrief.admissionNo}</span>
            <span>{sessions.length} 个字段</span>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mx-auto flex max-w-[980px] flex-col gap-4">
            {sessions.map((session) => {
              const hasDraft = Boolean(session.draft);
              const canWriteback = Boolean(hasDraft && fieldContext?.fieldKey === session.field.key);
              const generatedAt = formatTime(session.draft?.createdAt);
              return (
                <article key={session.field.key} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800">
                        <span className="truncate">{session.field.label}</span>
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
                        onClick={() => void handleGenerate(session.field.key, session.instruction.trim() || '生成当前字段')}
                        disabled={session.generating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {session.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                        {hasDraft ? '重新生成' : '生成'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApply(session.field.key)}
                        disabled={!canWriteback || session.applying}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        title={canWriteback ? '回填到 CS 当前字段' : '请先在 CS 端聚焦这个字段'}
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

                    {session.voiceOpen ? (
                      <div className="rounded-md border border-blue-100 bg-blue-50 p-2">
                        <textarea
                          value={session.voiceText}
                          onChange={(event) => updateSession(session.field.key, (item) => ({ ...item, voiceText: event.target.value }))}
                          className="h-16 w-full resize-none rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none focus:border-[#1E3A8A]"
                          placeholder="粘贴或确认语音转写文本"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleGenerate(session.field.key, '根据语音转写生成当前字段', session.voiceText.trim())}
                            disabled={!session.voiceText.trim() || session.generating}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#1E3A8A] px-3 text-[11px] font-bold text-white hover:bg-[#172554] disabled:opacity-50"
                          >
                            <SendOutlined />
                            语音生成
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateSession(session.field.key, (item) => ({ ...item, voiceOpen: !item.voiceOpen }))}
                        className={[
                          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm',
                          session.voiceOpen
                            ? 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A]'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-[#1E3A8A] hover:text-[#1E3A8A]',
                        ].join(' ')}
                        title="语音输入"
                        aria-label="语音输入"
                      >
                        <AudioOutlined />
                      </button>
                      <input
                        value={session.instruction}
                        onChange={(event) => updateSession(session.field.key, (item) => ({ ...item, instruction: event.target.value }))}
                        className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        placeholder="补充要求，例如：更简洁、补充依据"
                      />
                      <button
                        type="button"
                        onClick={() => void handleGenerate(session.field.key, session.instruction.trim() || '生成当前字段')}
                        disabled={session.generating}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {session.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <SendOutlined />}
                        发送
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-700">
              <CheckCircleOutlined className="mr-1" />
              当前页面按文书字段顺序展示，回填始终是单字段回填，不覆盖整篇。
            </div>
          </div>
        </section>
      </main>
    </ParadigmShell>
  );
}
