import { useMemo, useState } from 'react';
import {
  EditOutlined,
  FieldTimeOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { useFieldAssistStore } from '../../stores/useFieldAssistStore';
import { generateFieldDraft } from '../../services/fieldAssist/generation';
import { applyFieldDraft } from '../../services/fieldAssist/writeback';
import type { FieldAssistDraft } from '../../services/fieldAssist/types';
import { getFieldAssistContextKey } from '../../services/fieldAssist/types';

export default function FieldAssistPanel() {
  const context = useFieldAssistStore((state) => state.context);
  const drafts = useFieldAssistStore((state) => state.drafts);
  const addDraft = useFieldAssistStore((state) => state.addDraft);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applyingId, setApplyingId] = useState('');

  const currentDrafts = useMemo(() => {
    if (!context) return [];
    const contextKey = getFieldAssistContextKey(context);
    const identityKey = `${context.patientId}:${context.docCode}:${context.fieldKey}`;
    return drafts.filter((draft) => {
      if (draft.contextKey === contextKey) return true;
      return `${draft.response.patientId}:${draft.response.docCode}:${draft.response.fieldKey}` === identityKey;
    });
  }, [context, drafts]);

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

  if (!context) {
    return (
      <main className="h-full bg-[#F8FAFC] flex items-center justify-center px-6">
        <div className="w-full rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <FieldTimeOutlined className="text-2xl text-slate-400" />
          <div className="mt-3 text-sm font-bold text-slate-700">等待 CS 当前字段</div>
          <div className="mt-1 text-xs text-slate-400">在 CS 端聚焦一个文书输入框后，这里会显示字段助手。</div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full bg-[#F8FAFC] flex flex-col overflow-hidden">
      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-emerald-700">当前字段</div>
            <h2 className="mt-1 truncate text-base font-bold text-slate-900">
              {context.fieldLabel}
            </h2>
            <div className="mt-1 truncate text-xs text-slate-500">
              {context.patientName} · {context.docName}
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {currentDrafts.length === 0 && !generating ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
            <EditOutlined className="text-xl text-slate-400" />
            <div className="mt-2 text-sm font-bold text-slate-700">还没有字段草稿</div>
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
          <div className="rounded-lg border border-emerald-100 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <EditOutlined className="animate-pulse" />
              正在书写当前字段
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-50">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500" />
            </div>
          </div>
        ) : null}

        {currentDrafts.map((draft) => (
          <article key={draft.response.generationId} className="space-y-2">
            <div className="ml-10 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="truncate text-[11px] font-bold text-slate-500">
                当前回复 · {new Date(draft.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleGenerate('重新生成当前字段')}
                  disabled={generating || Boolean(applyingId)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {generating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                  重新生成
                </button>
                <button
                  type="button"
                  onClick={() => void handleApply(draft)}
                  disabled={Boolean(applyingId)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {applyingId === draft.response.generationId ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                  回填这次
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 text-[11px] font-bold text-slate-500">
                AI 回复 · {context.fieldLabel}
              </div>
            {draft.instruction ? (
              <div className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
                {draft.instruction}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {draft.generatedText || draft.response.generatedText}
            </p>
            {draft.response.warnings.length > 0 ? (
              <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                {draft.response.warnings.join('；')}
              </div>
            ) : null}
            </div>
          </article>
        ))}
      </section>

      <form
        className="border-t border-slate-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate(instruction.trim() || '生成当前字段');
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="输入补充要求，例如：更简洁、补充诊疗依据"
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
