import { useState } from 'react';
import type { ReactNode } from 'react';
import { message } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ClinicalSection, PatientBrief } from '../../services/types';
import type { DocumentPaperMetaCell } from './DocumentPaper';
import {
  formatRewriteStatusSyncWarning,
  normalizeSectionRewriteResult,
  type SectionOptimize,
  type SectionRewriteStatusHandler,
} from './SectionEditor';
import type { SectionListOptimize } from './DocumentSectionEditorList';

interface PendingRewrite {
  sectionKey: string;
  before: string;
  after: string;
  requestId?: string | number;
}

interface Props {
  docName: string;
  patient: PatientBrief;
  sections: ClinicalSection[];
  metaRows?: DocumentPaperMetaCell[][];
  actions?: ReactNode;
  notice?: ReactNode;
  locked?: boolean;
  sectionEdits?: Record<string, string>;
  resetKeys?: Record<string, number>;
  sectionSuffixes?: Record<string, ReactNode>;
  sectionToolbarActions?: Record<string, ReactNode>;
  sectionBottomNodes?: Record<string, ReactNode>;
  sectionBadgeLabel?: string;
  regeneratingSectionKey?: string | null;
  onChange: (sectionKey: string, text: string) => void;
  onReset: (sectionKey: string) => void;
  onRegenerateSection?: (sectionKey: string) => void;
  onFocusSection?: (sectionKey: string) => void;
  optimize?: SectionOptimize;
  optimizeSection?: SectionListOptimize;
  onRewriteStatusChange?: SectionRewriteStatusHandler;
}

function displayText(
  section: ClinicalSection,
  sectionEdits?: Record<string, string>,
) {
  return sectionEdits?.[section.key] ?? sectionEdits?.[section.title] ?? section.text;
}

function isEdited(
  section: ClinicalSection,
  sectionEdits?: Record<string, string>,
) {
  return sectionEdits?.[section.key] != null || sectionEdits?.[section.title] != null;
}

function flattenMetaRows(metaRows?: DocumentPaperMetaCell[][]) {
  return (metaRows ?? []).flat().filter((cell) => cell.value !== undefined && cell.value !== null);
}

export default function DocumentChatWorkspace({
  docName,
  patient,
  sections,
  metaRows,
  actions,
  notice,
  locked,
  sectionEdits,
  resetKeys,
  sectionSuffixes,
  sectionToolbarActions,
  sectionBottomNodes,
  sectionBadgeLabel = '概括总结',
  regeneratingSectionKey,
  onChange,
  onReset,
  onRegenerateSection,
  onFocusSection,
  optimize,
  optimizeSection,
  onRewriteStatusChange,
}: Props) {
  const [optimizingSectionKey, setOptimizingSectionKey] = useState('');
  const [pendingRewrite, setPendingRewrite] = useState<PendingRewrite | null>(null);
  const metaCells = flattenMetaRows(metaRows);
  const canOptimize = Boolean(optimize || optimizeSection);

  const runOptimize = async (section: ClinicalSection) => {
    const currentText = displayText(section, sectionEdits).trim();
    if (!currentText) {
      message.warning('当前段落为空，无法补全。');
      return;
    }

    setOptimizingSectionKey(section.key);
    try {
      const result = optimizeSection
        ? await optimizeSection(section, currentText, 'polish')
        : await optimize?.(currentText, 'polish');
      if (!result) return;
      const normalized = normalizeSectionRewriteResult(result, currentText);
      setPendingRewrite({ sectionKey: section.key, ...normalized });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'AI 补全失败，请稍后重试。');
    } finally {
      setOptimizingSectionKey('');
    }
  };

  const syncRewriteStatus = async (requestId: string | number, status: 'adopted' | 'rejected') => {
    if (!onRewriteStatusChange) return;
    try {
      await onRewriteStatusChange(requestId, status);
    } catch (error) {
      message.warning(formatRewriteStatusSyncWarning(status, error));
    }
  };

  const acceptRewrite = () => {
    if (!pendingRewrite) return;
    onChange(pendingRewrite.sectionKey, pendingRewrite.after);
    if (pendingRewrite.requestId != null) {
      void syncRewriteStatus(pendingRewrite.requestId, 'adopted');
    }
    setPendingRewrite(null);
    message.success('已采纳补全内容。');
  };

  const rejectRewrite = () => {
    if (pendingRewrite?.requestId != null) {
      void syncRewriteStatus(pendingRewrite.requestId, 'rejected');
    }
    setPendingRewrite(null);
  };

  return (
    <div className="min-h-full bg-[#F8FAFC] px-4 py-4">
      <div className="mx-auto flex max-w-[980px] flex-col gap-3">
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#1E3A8A]">文书对话</div>
              <h3 className="mt-1 truncate text-base font-extrabold text-slate-900">{docName}</h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>{patient.name}</span>
                <span>{patient.gender} {patient.age}</span>
                <span>住院号 {patient.admissionNo}</span>
              </div>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{actions}</div> : null}
          </div>

          {metaCells.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {metaCells.map((cell) => (
                <span
                  key={`${cell.label}-${String(cell.value)}`}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500"
                >
                  {cell.label}：{cell.value}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {notice}

        <section className="space-y-4">
          {sections.map((section) => {
            const text = displayText(section, sectionEdits);
            const edited = isEdited(section, sectionEdits);
            const disabled = Boolean(locked || !section.editable);
            const regenerating = regeneratingSectionKey === section.key;
            const optimizing = optimizingSectionKey === section.key;
            const suffix = sectionSuffixes?.[section.key] ?? sectionSuffixes?.[section.title];
            const toolbarActions = sectionToolbarActions?.[section.key] ?? sectionToolbarActions?.[section.title];
            const rewrite = pendingRewrite?.sectionKey === section.key ? pendingRewrite : null;

            return (
              <article
                key={`${section.key}-${resetKeys?.[section.key] ?? 0}`}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#F0F5FF] px-2 py-1 text-[11px] font-extrabold text-[#1E3A8A]">
                        {sectionBadgeLabel}
                      </span>
                      {section.required ? (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                          必填
                        </span>
                      ) : null}
                      {edited ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                          已修改
                        </span>
                      ) : null}
                      {suffix}
                    </div>
                    <h4 className="mt-2 truncate text-sm font-extrabold text-slate-900">{section.title}</h4>
                  </div>

                  {!disabled ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {toolbarActions}
                      {onRegenerateSection ? (
                        <button
                          type="button"
                          onClick={() => onRegenerateSection(section.key)}
                          disabled={regenerating || optimizing}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="重新生成当前概括总结"
                        >
                          {regenerating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                          重新生成
                        </button>
                      ) : null}
                      {canOptimize ? (
                        <button
                          type="button"
                          onClick={() => void runOptimize(section)}
                          disabled={regenerating || optimizing}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-[#1E3A8A] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="补全当前概括总结"
                        >
                          {optimizing ? <Loading3QuartersOutlined className="animate-spin" /> : <ThunderboltOutlined />}
                          补全
                        </button>
                      ) : null}
                      {edited ? (
                        <button
                          type="button"
                          onClick={() => onReset(section.key)}
                          disabled={regenerating || optimizing}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="撤销医生对当前概括总结的修改"
                        >
                          <UndoOutlined />
                          重置
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <textarea
                  value={text}
                  disabled={disabled}
                  onFocus={() => onFocusSection?.(section.key)}
                  onChange={(event) => onChange(section.key, event.target.value)}
                  className="min-h-[112px] w-full resize-y rounded-lg border border-slate-200 bg-[#FBFDFF] px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-[#1E3A8A] focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder={`填写${section.title}`}
                />

                {sectionBottomNodes?.[section.key] ? (
                  <div className="mt-3">
                    {sectionBottomNodes[section.key]}
                  </div>
                ) : null}

                {rewrite ? (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed">
                    <div className="font-bold text-[#1E3A8A]">补全建议</div>
                    <div className="mt-1 space-y-1 text-slate-600">
                      <div>修改前：{rewrite.before}</div>
                      <div className="font-semibold text-slate-800">修改后：{rewrite.after}</div>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={rejectRewrite}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        <CloseOutlined />
                        拒绝
                      </button>
                      <button
                        type="button"
                        onClick={acceptRewrite}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-[#1E3A8A] px-2 text-[11px] font-bold text-white hover:bg-[#172554]"
                      >
                        <CheckOutlined />
                        采纳
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
