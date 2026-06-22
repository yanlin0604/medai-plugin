import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AudioOutlined,
  CheckCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { message, Popover, Tag } from 'antd';
import { useFieldAssistStore } from '../../stores/useFieldAssistStore';
import type { RuntimeEvidenceSummaryDto } from '../../services/pluginRuntimeTypes';
import { usePatientStore } from '../../stores/usePatientStore';
import { getLatestFieldAssistContext, isUsableFieldAssistContext } from '../../services/fieldAssist/contextBridge';
import { buildSuggestionDraft, generateFieldDraft } from '../../services/fieldAssist/generation';
import { applyFieldDraft } from '../../services/fieldAssist/writeback';
import type { FieldAssistDraft } from '../../services/fieldAssist/types';
import { getFieldAssistContextKey, getFieldAssistSnapshotKey } from '../../services/fieldAssist/types';

const VOICE_PLACEHOLDER = '语音转写文本会出现在这里，也可以先手动粘贴转写结果。';
const FIELD_CONTEXT_POLL_MS = 1800;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getDraftTitle(draft: FieldAssistDraft) {
  if (draft.instruction?.includes('语音转写')) return '语音生成';
  if (draft.instruction?.includes('语音原文')) return '语音原文';
  if (draft.source === 'suggestion') return '候选回填';
  return '字段生成';
}

export function renderTextWithCitations(text: string, evidenceSummary?: RuntimeEvidenceSummaryDto[]) {
  if (!text) return null;
  const parts = text.split(/(\[[a-zA-Z0-9\-_,，\s]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\[[a-zA-Z0-9\-_,，\s]+\]$/.test(part)) {
          const match = part.match(/[a-zA-Z0-9\-_]+/g);
          if (!match || !evidenceSummary?.length) return <span key={i}>{part}</span>;
          
          return (
            <span key={i} className="inline-flex items-center">
              {match.map((idStr, j) => {
                let evidence: RuntimeEvidenceSummaryDto | undefined;
                let displayNum = idStr;
                
                if (/^\d+$/.test(idStr)) {
                  const idx = parseInt(idStr, 10) - 1;
                  evidence = evidenceSummary[idx];
                } else {
                  const idx = evidenceSummary.findIndex(e => e.evidenceId === idStr);
                  if (idx !== -1) {
                    evidence = evidenceSummary[idx];
                    displayNum = String(idx + 1);
                  } else {
                    const partialIdx = evidenceSummary.findIndex(e => e.evidenceId?.includes(idStr));
                    if (partialIdx !== -1) {
                      evidence = evidenceSummary[partialIdx];
                      displayNum = String(partialIdx + 1);
                    }
                  }
                }
                
                if (!evidence) return <span key={`${i}-${j}`}>[{idStr}]</span>;
                const displaySourceSystem = evidence.sourceSystem?.toLowerCase() === 'cs-demo' 
                  ? '病历系统' 
                  : evidence.sourceSystem;
                
                const content = (
                  <div className="max-w-[280px] text-[11px] leading-relaxed">
                    <div className="font-bold mb-1 text-slate-800">{evidence.title || '证据详情'}</div>
                    {displaySourceSystem && (
                      <div className="text-slate-500 mb-1">来源系统：{displaySourceSystem}</div>
                    )}
                    <div className="text-slate-600 whitespace-pre-wrap max-h-[240px] overflow-y-auto pr-1.5 custom-scrollbar">{evidence.summary}</div>
                  </div>
                );
                return (
                  <Popover key={`${i}-${j}`} content={content} trigger="click" overlayInnerStyle={{ padding: '8px 12px' }}>
                    <Tag color="blue" className="mx-[1px] px-1 py-0 cursor-pointer hover:bg-blue-100 border-blue-200 leading-tight" title="点击查看出处">
                      {displayNum}
                    </Tag>
                  </Popover>
                );
              })}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function FieldAssistPanel() {
  const navigate = useNavigate();
  const context = useFieldAssistStore((state) => state.context);
  const drafts = useFieldAssistStore((state) => state.drafts);
  const addDraft = useFieldAssistStore((state) => state.addDraft);
  const setContext = useFieldAssistStore((state) => state.setContext);
  const currentPatient = usePatientStore((state) => state.currentPatient);
  const selectedDoc = usePatientStore((state) => state.selectedDoc);
  const [instruction, setInstruction] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applyingId, setApplyingId] = useState('');
  const latestFieldSnapshotKeyRef = useRef('');

  const currentDrafts = useMemo(() => {
    if (!context) return [];
    const contextKey = getFieldAssistContextKey(context);
    const identityKey = `${context.patientId}:${context.docCode}:${context.fieldKey}`;
    return drafts.filter((draft) => {
      if (draft.contextKey === contextKey) return true;
      return `${draft.response.patientId}:${draft.response.docCode}:${draft.response.fieldKey}` === identityKey;
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [context, drafts]);

  useEffect(() => {
    latestFieldSnapshotKeyRef.current = context ? getFieldAssistSnapshotKey(context) : '';
  }, [context]);

  useEffect(() => {
    let disposed = false;

    const pollFieldContext = async () => {
      const nextContext = await getLatestFieldAssistContext();
      if (disposed) return;

      const usableContext = isUsableFieldAssistContext(nextContext) ? nextContext : null;
      if (!usableContext) return;

      const nextSnapshotKey = getFieldAssistSnapshotKey(usableContext);
      if (nextSnapshotKey === latestFieldSnapshotKeyRef.current) return;

      latestFieldSnapshotKeyRef.current = nextSnapshotKey;
      setContext(usableContext);
    };

    void pollFieldContext();
    const timer = window.setInterval(() => {
      void pollFieldContext();
    }, FIELD_CONTEXT_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [setContext]);

  const handleGenerate = async (nextInstruction?: string) => {
    if (!context || generating) return;
    setGenerating(true);
    try {
      const draft = await generateFieldDraft(context, nextInstruction);
      addDraft(draft);
      setInstruction('');
      message.success('字段内容已生成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '字段生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleRecording = () => {
    if (recording) {
      setRecording(false);
      message.info('已停止语音采集，请确认转写文本后处理。');
      return;
    }
    setVoiceOpen(true);
    setRecording(true);
    message.loading({ content: '正在采集语音...', key: 'field-voice' });
    window.setTimeout(() => {
      setRecording(false);
      setVoiceText((value) => value || `请根据医生口述补充${context?.fieldLabel ?? '当前字段'}。`);
      message.success({ content: '语音转写已生成，请确认后处理。', key: 'field-voice', duration: 1.5 });
    }, 1200);
  };

  const handleInsertVoiceRaw = async () => {
    if (!context || applyingId) return;
    const text = voiceText.trim();
    if (!text) {
      message.warning('请先确认语音转写文本');
      return;
    }

    const draft = buildSuggestionDraft(context, text, '语音原文');
    addDraft(draft);
    setApplyingId(draft.response.generationId);
    try {
      await applyFieldDraft({
        context,
        response: draft.response,
        doctorName: '林志远 主治医师',
      });
      message.success('语音原文已回填当前字段');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '语音原文回填失败');
    } finally {
      setApplyingId('');
    }
  };

  const handleGenerateFromVoice = async () => {
    if (!context || generating) return;
    const text = voiceText.trim();
    if (!text) {
      message.warning('请先确认语音转写文本');
      return;
    }

    setGenerating(true);
    try {
      const draft = await generateFieldDraft(context, '根据语音转写生成当前字段', text);
      addDraft(draft);
      message.success('已根据语音生成字段草稿');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '语音生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async (draft: FieldAssistDraft) => {
    if (!context || applyingId) return;
    setApplyingId(draft.response.generationId);
    try {
      await applyFieldDraft({
        context,
        response: draft.response,
        doctorName: '林志远 主治医师',
      });
      message.success('已回填当前字段');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回填失败');
    } finally {
      setApplyingId('');
    }
  };

  const selectedDocName = selectedDoc?.name ?? context?.docName ?? '未选中文书';
  const selectedPatientName = currentPatient?.name ?? context?.patientName ?? '未选中患者';

  if (!context) {
    return (
      <main className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
        <section className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#1E3A8A]">字段对话</div>
              <h2 className="mt-1 truncate text-[17px] font-extrabold text-slate-900">{selectedDocName}</h2>
              <div className="mt-1 truncate text-xs text-slate-500">{selectedPatientName}</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            >
              返回列表
            </button>
          </div>
        </section>
        <section className="flex flex-1 items-center justify-center px-6">
          <div className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-5 py-7 text-center shadow-sm">
            <EditOutlined className="text-xl text-slate-400" />
            <div className="mt-3 text-sm font-bold text-slate-700">等待 CS 当前字段</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">
              在 CS 端点击这个文书里的任一字段后，这里会自动切换成该字段的聊天对话。
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
      <section className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <CheckCircleOutlined />
              当前字段
            </div>
            <h2 className="mt-1 truncate text-[17px] font-extrabold text-slate-900">
              {context.fieldLabel}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="truncate">{context.patientName}</span>
              <span>·</span>
              <span className="truncate">{context.docName}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            >
              返回
            </button>
            <button
              type="button"
              onClick={() => navigate(`/doc/${context.docCode}?mode=read`)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            >
              <FileTextOutlined />
              全文通读
            </button>
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex justify-start">
          <div className="inline-flex max-w-[88%] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">
            <HistoryOutlined className="text-[#1E3A8A]" />
            本字段 {currentDrafts.length} 次生成
          </div>
        </div>

        {currentDrafts.length === 0 && !generating ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
            <EditOutlined className="text-lg text-slate-400" />
            <div className="mt-2 text-sm font-bold text-slate-700">这个字段还没有生成内容</div>
            <div className="mt-1 text-xs text-slate-400">直接生成，或在底部输入要求后发送。</div>
            <button
              type="button"
              onClick={() => void handleGenerate('生成当前字段')}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <SendOutlined />
              生成当前字段
            </button>
          </div>
        ) : null}

        {generating ? (
          <div className="mb-3 max-w-[88%] rounded-lg rounded-bl-sm border border-emerald-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
              <EditOutlined className="animate-pulse" />
              正在书写当前字段
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-50">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500" />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {currentDrafts.map((draft) => (
            <article key={draft.response.generationId} className="max-w-[92%] self-start">
              <div className="mb-1 ml-1 flex items-center gap-2 text-[10px] font-medium text-slate-400">
                <span>{getDraftTitle(draft)}</span>
                <span>{formatTime(draft.createdAt)}</span>
              </div>
              <div className="rounded-lg rounded-bl-sm border border-slate-200 bg-white px-3 py-3 shadow-sm">
                {draft.instruction ? (
                  <div className="mb-2 inline-flex max-w-full rounded-full bg-slate-50 px-2.5 py-1 text-[11px] leading-5 text-slate-500">
                    <span className="truncate">{draft.instruction}</span>
                  </div>
                ) : null}
                <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {renderTextWithCitations(draft.generatedText || draft.response.generatedText || '', draft.response.evidenceSummary)}
                </p>
                {(draft.response.evidenceSummary ?? []).length > 0 ? (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] leading-5 text-[#1E3A8A]">
                    <InfoCircleOutlined className="mr-1" />
                    {(draft.response.evidenceSummary ?? []).map((item) => item.summary || item.title).filter(Boolean).join('；')}
                  </div>
                ) : null}
                {(draft.response.warnings ?? []).length > 0 ? (
                  <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-5 text-amber-700">
                    {(draft.response.warnings ?? []).join('；')}
                  </div>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleGenerate('重新生成当前字段')}
                    disabled={generating || Boolean(applyingId)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {generating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                    重新生成
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApply(draft)}
                    disabled={Boolean(applyingId)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {applyingId === draft.response.generationId ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                    回填这次
                  </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {voiceOpen ? (
        <section className="border-t border-slate-200 bg-white px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-700">
              <AudioOutlined className={recording ? 'animate-pulse text-rose-500' : 'text-[#1E3A8A]'} />
              语音输入
            </div>
            <button
              type="button"
              onClick={handleToggleRecording}
              className={[
                'h-7 rounded-md px-2.5 text-[11px] font-bold text-white',
                recording ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#1E3A8A] hover:bg-[#172554]',
              ].join(' ')}
            >
              {recording ? '停止' : '开始'}
            </button>
          </div>
          <textarea
            value={voiceText}
            onChange={(event) => setVoiceText(event.target.value)}
            placeholder={VOICE_PLACEHOLDER}
            className="h-16 w-full resize-none rounded-md border border-slate-200 bg-[#FBFDFF] px-3 py-2 text-xs leading-5 text-slate-800 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleInsertVoiceRaw()}
              disabled={Boolean(applyingId)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <UploadOutlined />
              插入原文
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateFromVoice()}
              disabled={generating}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {generating ? <Loading3QuartersOutlined className="animate-spin" /> : <EditOutlined />}
              生成字段
            </button>
          </div>
        </section>
      ) : null}

      <form
        className="border-t border-slate-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate(instruction.trim() || '生成当前字段');
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceOpen((value) => !value)}
            className={[
              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-sm',
              voiceOpen
                ? 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A]'
                : 'border-slate-200 bg-white text-slate-500 hover:border-[#1E3A8A] hover:text-[#1E3A8A]',
            ].join(' ')}
            title="语音输入"
            aria-label="语音输入"
          >
            <AudioOutlined />
          </button>
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="补充要求，例如：更简洁、补充依据"
          />
          <button
            type="submit"
            disabled={generating}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <SendOutlined />
            发送
          </button>
        </div>
      </form>
    </main>
  );
}
