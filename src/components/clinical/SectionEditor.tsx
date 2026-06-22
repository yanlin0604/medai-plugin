import { useState, useRef, useEffect } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { message } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, UndoOutlined } from '@ant-design/icons';
import { suggestTerms } from '../../services/clinicalService';

export type SectionEditorVariant = 'card' | 'paper';
export type SectionRewriteStatus = 'adopted' | 'rejected';

export interface SectionRewriteResult {
  before?: string;
  after: string;
  requestId?: string | number;
}

export type SectionOptimize = (
  text: string,
  mode: string,
) => string | SectionRewriteResult | Promise<string | SectionRewriteResult>;

export type SectionRewriteStatusHandler = (
  requestId: string | number,
  status: SectionRewriteStatus,
) => void | Promise<void>;

interface MaterialDropDetail {
  text: string;
  clientX?: number;
  clientY?: number;
}

export function normalizeSectionRewriteResult(
  result: string | SectionRewriteResult,
  before: string,
): { before: string; after: string; requestId?: string | number } {
  if (typeof result === 'string') return { before, after: result };
  return { before: result.before ?? before, after: result.after, requestId: result.requestId };
}

export function formatSectionRewriteError(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 优化失败，请稍后重试。';
}

export function formatRewriteStatusSyncWarning(
  status: SectionRewriteStatus,
  error: unknown,
): string {
  const action = status === 'adopted' ? '采纳' : '拒绝';
  const detail = error instanceof Error ? error.message : '审计状态同步失败';
  return `优化已${action}，但${detail}`;
}

interface Props {
  /** 段落名（如 主诉/现病史） */
  section: string;
  /** 段落正文（要素渲染值，或医生手动改写值） */
  text: string;
  /** 是否已手动改写（显示「重置本段」） */
  edited: boolean;
  locked?: boolean;
  sectionSuffix?: ReactNode;
  density?: 'compact' | 'comfortable';
  variant?: SectionEditorVariant;
  /** 编辑回调：上提该段最新纯文本 */
  onChange: (text: string) => void;
  /** 重置本段（撤销手动改写，回到要素渲染值；由父级经 key remount 实现） */
  onReset: () => void;
  /** 重新请求后台字段生成，仅替换本段 */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** 划词优化实现（样例/真实 AI 由父注入） */
  optimize: SectionOptimize;
  /** 后台重写审计状态同步；同步失败不得回滚正文 */
  onRewriteStatusChange?: SectionRewriteStatusHandler;
  onFocus?: () => void;
}

const toHtml = (t: string) => t.replace(/\n/g, '<br>');

interface SugState {
  visible: boolean;
  items: string[];
  index: number;
  top: number;
  left: number;
  prefixLen: number;
}

const EMPTY_SUG: SugState = { visible: false, items: [], index: 0, top: 0, left: 0, prefixLen: 0 };

/**
 * 成稿单段编辑器（纸张式连续排版的一段）。
 * 段内可直接编辑、选中文字可划词优化、输入时弹医疗术语联想；编辑值经 onChange 上提父级 values 体系。
 *
 * 编辑保护：onInput 仅上提值、不回流重设 DOM（避免光标跳）；外部 text 变化时仅「未手动编辑」段同步。
 * 术语联想（IME 安全）：中文输入法组字中(composing)不触发，组字完成或英文输入后防抖联想；
 * 插入用 execCommand 替换光标前缀，不重设 innerHTML，保护光标。
 */
export default function SectionEditor({
  section,
  text,
  edited,
  locked,
  sectionSuffix,
  density = 'compact',
  variant = 'card',
  onChange,
  onReset,
  onRegenerate,
  regenerating,
  optimize,
  onRewriteStatusChange,
  onFocus,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editedRef = useRef(false);
  const composingRef = useRef(false);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [html, setHtml] = useState(() => toHtml(text));
  const savedRange = useRef<Range | null>(null);
  const savedText = useRef('');
  const [menu, setMenu] = useState({ visible: false, top: 0, left: 0 });
  const [diff, setDiff] = useState<{
    visible: boolean;
    before: string;
    after: string;
    requestId?: string | number;
  }>({ visible: false, before: '', after: '' });
  const [optimizing, setOptimizing] = useState(false);
  const [sug, setSug] = useState<SugState>(EMPTY_SUG);
  const comfortable = density === 'comfortable';
  const paper = variant === 'paper';
  const titleClass = paper ? 'text-sm' : comfortable ? 'text-sm' : 'text-[11px]';
  const actionClass = comfortable ? 'text-xs' : 'text-[10px]';
  const editorClass = paper
    ? comfortable
      ? 'min-h-[88px] text-sm leading-7 px-3 py-2.5'
      : 'min-h-[48px] text-[11px] leading-relaxed px-2.5 py-1.5'
    : comfortable
      ? 'min-h-[96px] text-sm leading-7 px-3 py-2.5'
      : 'min-h-[52px] text-[11px] leading-relaxed px-2.5 py-1.5';
  const rootClass = paper
    ? 'relative py-4 first:pt-0 last:pb-0'
    : 'relative bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5 shadow-sm';
  const headerClass = paper ? 'mb-1.5 flex flex-wrap items-start justify-between gap-2' : 'flex justify-between items-center gap-2';
  const titleWrapClass = paper ? 'flex min-w-0 flex-wrap items-center gap-1.5' : 'flex items-center gap-1.5 min-w-0';
  const titleTextClass = paper
    ? `${titleClass} font-bold text-slate-900`
    : `${titleClass} font-bold text-slate-700 truncate`;
  const actionWrapClass = paper ? 'flex shrink-0 flex-wrap items-center justify-end gap-1.5' : 'flex items-center gap-2 shrink-0';
  const polishButtonClass = paper
    ? `inline-flex items-center gap-1 ${actionClass} font-semibold text-[#1E3A8A] hover:text-[#172554] hover:bg-[#EFF6FF] rounded px-1.5 py-0.5 transition-colors`
    : `inline-flex items-center gap-1 ${actionClass} font-bold text-[#6D28D9] bg-[#F5F3FF] border border-[#DDD6FE] hover:bg-[#EDE9FE] rounded px-2 py-1 transition-colors`;
  const resetButtonClass = paper
    ? `inline-flex items-center gap-1 ${actionClass} text-slate-400 hover:text-[#854D0E] hover:bg-amber-50 rounded px-1.5 py-0.5`
    : `inline-flex items-center gap-1 ${actionClass} text-slate-400 hover:text-[#854D0E]`;
  const regenerateButtonClass = paper
    ? `inline-flex items-center gap-1 ${actionClass} text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-60`
    : `inline-flex items-center gap-1 ${actionClass} text-slate-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60`;
  const editableClass = paper
    ? `${editorClass} text-slate-700 outline-none bg-white/70 border-l-2 border-transparent rounded-sm whitespace-pre-wrap transition-colors hover:border-l-slate-200 focus:border-l-[#1E3A8A] focus:bg-[#F8FAFC] focus:ring-1 focus:ring-[#93C5FD]`
    : `${editorClass} text-slate-700 outline-none bg-white border border-slate-200 rounded-md focus:border-[#1E3A8A] transition-colors`;
  const diffClass = paper
    ? 'mt-2 bg-[#F8FAFC] border border-[#BFDBFE] rounded-md p-2.5 text-[11.5px] animate-pop-up'
    : 'mt-2 bg-[#F0F5FF] border-[1.5px] border-[#93C5FD] rounded-lg p-2.5 text-[11.5px] animate-pop-up';

  // 外部 text 变化（要素变更）：仅未本地编辑时同步 DOM，保护正在编辑的内容
  useEffect(() => {
    if (!editedRef.current) setHtml(toHtml(text));
  }, [text]);

  // 卸载清理联想防抖
  useEffect(() => () => { if (sugTimer.current) clearTimeout(sugTimer.current); }, []);

  const closeSug = () => setSug((s) => (s.visible ? EMPTY_SUG : s));

  // 取光标前连续中文/字母作为联想前缀（光标须 collapsed 且落在文本节点）
  const getPrefix = (): string => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) return '';
    const before = (range.startContainer.textContent ?? '').slice(0, range.startOffset);
    const m = before.match(/[一-龥A-Za-z]{2,}$/);
    return m ? m[0] : '';
  };

  const caretPos = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ref.current) return { top: 0, left: 0 };
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const pr = ref.current.getBoundingClientRect();
    return { top: r.bottom - pr.top + 4, left: Math.max(0, r.left - pr.left) };
  };

  const scheduleSuggest = () => {
    if (sugTimer.current) clearTimeout(sugTimer.current);
    sugTimer.current = setTimeout(async () => {
      if (composingRef.current) return;
      const prefix = getPrefix();
      if (prefix.length < 2) {
        closeSug();
        return;
      }
      const items = await suggestTerms(prefix);
      if (!items.length) {
        closeSug();
        return;
      }
      const pos = caretPos();
      setSug({ visible: true, items, index: 0, top: pos.top, left: pos.left, prefixLen: prefix.length });
    }, 300);
  };

  const handleInput = () => {
    editedRef.current = true;
    onChange(ref.current?.innerText ?? '');
    if (composingRef.current) return; // 中文输入法组字中不联想，待 compositionend
    scheduleSuggest();
  };

  const handlePaste = (e: ReactClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const plainText = e.clipboardData.getData('text/plain');
    if (!plainText) return;
    e.preventDefault();
    document.execCommand('insertText', false, plainText);
    editedRef.current = true;
    onChange(ref.current?.innerText ?? '');
    scheduleSuggest();
  };

  const moveCaretToEnd = () => {
    if (!ref.current) return;
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const ensureDropRangeInEditor = () => {
    if (!ref.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      moveCaretToEnd();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) {
      moveCaretToEnd();
    }
  };

  const setDropRangeFromPoint = (x: number, y: number): boolean => {
    if (!ref.current) return false;
    const doc = document as Document & {
      caretPositionFromPoint?: (left: number, top: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (left: number, top: number) => Range | null;
    };
    const range = document.createRange();
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    } else {
      const legacyRange = doc.caretRangeFromPoint?.(x, y);
      if (!legacyRange) return false;
      range.setStart(legacyRange.startContainer, legacyRange.startOffset);
      range.collapse(true);
    }
    if (!ref.current.contains(range.commonAncestorContainer)) return false;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  };

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (locked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const insertPlainTextAtPoint = (plainText: string, clientX?: number, clientY?: number) => {
    if (locked) return;
    if (!plainText) return;
    ref.current?.focus();
    if (
      typeof clientX !== 'number'
      || typeof clientY !== 'number'
      || !setDropRangeFromPoint(clientX, clientY)
    ) {
      ensureDropRangeInEditor();
    }
    if (!document.execCommand('insertText', false, plainText)) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(plainText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    editedRef.current = true;
    onChange(ref.current?.innerText ?? '');
    scheduleSuggest();
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (locked) return;
    const plainText = e.dataTransfer.getData('text/plain');
    if (!plainText) return;
    e.preventDefault();
    insertPlainTextAtPoint(plainText, e.clientX, e.clientY);
  };

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const handleMaterialDrop = (event: Event) => {
      const detail = (event as CustomEvent<MaterialDropDetail>).detail;
      if (!detail?.text) return;
      event.preventDefault();
      insertPlainTextAtPoint(detail.text, detail.clientX, detail.clientY);
    };
    element.addEventListener('medai-material-drop', handleMaterialDrop);
    return () => element.removeEventListener('medai-material-drop', handleMaterialDrop);
  });

  // 采纳联想：替换光标前已输入的前缀为完整术语
  const acceptSuggest = (term: string) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current) {
      const range = sel.getRangeAt(0);
      try {
        range.setStart(range.startContainer, Math.max(0, range.startOffset - sug.prefixLen));
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, term);
        editedRef.current = true;
        onChange(ref.current.innerText);
      } catch {
        // 选区异常忽略
      }
    }
    closeSug();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!sug.visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSug((s) => ({ ...s, index: (s.index + 1) % s.items.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSug((s) => ({ ...s, index: (s.index - 1 + s.items.length) % s.items.length }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      acceptSuggest(sug.items[sug.index]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      acceptSuggest(sug.items[sug.index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSug();
    }
  };

  // 划词：段内选中文字弹优化菜单
  const handleMouseUp = () => {
    if (locked) return;
    const sel = window.getSelection();
    const t = sel?.toString().trim() ?? '';
    if (t.length >= 3 && ref.current && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      savedRange.current = range.cloneRange();
      savedText.current = t;
      const rect = range.getBoundingClientRect();
      const pr = ref.current.getBoundingClientRect();
      setMenu({ visible: true, top: rect.bottom - pr.top + 6, left: Math.max(0, rect.left - pr.left) });
    } else {
      setMenu((m) => ({ ...m, visible: false }));
    }
  };

  const applyOptimize = async (mode: string) => {
    setMenu((m) => ({ ...m, visible: false }));
    const before = savedText.current;
    if (!before.trim()) return;
    setOptimizing(true);
    try {
      const result = await optimize(before, mode);
      const normalized = normalizeSectionRewriteResult(result, before);
      setDiff({ visible: true, ...normalized });
    } catch (error) {
      message.error(formatSectionRewriteError(error));
    } finally {
      setOptimizing(false);
    }
  };

  const polishSection = async () => {
    const current = ref.current?.innerText.trim() ?? '';
    if (!current) {
      message.warning('当前段落为空，无法润色。');
      return;
    }
    savedRange.current = null;
    savedText.current = current;
    await applyOptimize('polish');
  };

  const regenerateSection = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRegenerate?.();
  };

  const syncRewriteStatus = async (requestId: string | number, status: SectionRewriteStatus) => {
    if (!onRewriteStatusChange) return;
    try {
      await onRewriteStatusChange(requestId, status);
    } catch (error) {
      message.warning(formatRewriteStatusSyncWarning(status, error));
    }
  };

  const acceptDiff = () => {
    const requestId = diff.requestId;
    if (ref.current && savedRange.current) {
      ref.current.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
      document.execCommand('insertText', false, diff.after);
      editedRef.current = true;
      onChange(ref.current.innerText);
    } else if (ref.current) {
      ref.current.innerText = diff.after;
      setHtml(toHtml(diff.after));
      editedRef.current = true;
      onChange(diff.after);
    }
    setDiff({ visible: false, before: '', after: '' });
    message.success('已采纳优化表达。');
    if (requestId != null) void syncRewriteStatus(requestId, 'adopted');
  };

  const rejectDiff = () => {
    const requestId = diff.requestId;
    setDiff({ visible: false, before: '', after: '' });
    if (requestId != null) void syncRewriteStatus(requestId, 'rejected');
  };

  return (
    <div className={rootClass}>
      <div className={headerClass}>
        <div className={titleWrapClass}>
          <span className={titleTextClass}>{section}</span>
          {sectionSuffix}
        </div>
        {!locked && (
          <div className={actionWrapClass}>
            <button
              onClick={polishSection}
              disabled={optimizing || regenerating}
              title="对整段生成润色建议，采纳后才替换正文"
              className={polishButtonClass}
            >
              <ThunderboltOutlined />
              {optimizing ? '处理中' : '补全'}
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={regenerateSection}
                disabled={regenerating || optimizing}
                title="重新请求后台字段生成结果，仅替换本段"
                className={regenerateButtonClass}
              >
                <ReloadOutlined className={regenerating ? 'animate-spin' : undefined} />
                {regenerating ? '生成中' : '重新生成'}
              </button>
            )}
            {edited && (
              <button
                onClick={onReset}
                title="撤销手动修改，按要素重新生成本段"
                className={resetButtonClass}
              >
                <UndoOutlined />
                重置本段
              </button>
            )}
          </div>
        )}
      </div>
      <div
        ref={ref}
        data-section-editor-drop-target="true"
        contentEditable={!locked}
        suppressContentEditableWarning
        onFocus={onFocus}
        onMouseUp={handleMouseUp}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          scheduleSuggest();
        }}
        onBlur={() => setTimeout(closeSug, 150)}
        dangerouslySetInnerHTML={{ __html: html }}
        className={editableClass}
      />

      {/* 医疗术语输入联想 */}
      {sug.visible && !locked && (
        <div
          className="absolute z-50 max-w-[260px] bg-white border border-slate-200 rounded-md shadow-lg text-[11px] overflow-hidden min-w-[150px]"
          style={{ top: sug.top, left: sug.left }}
        >
          {sug.items.map((it, i) => (
            <div
              key={it}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptSuggest(it);
              }}
              className={`px-2.5 py-1.5 cursor-pointer break-words ${i === sug.index ? 'bg-[#F0F5FF] text-[#1E3A8A] font-semibold' : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              {it}
            </div>
          ))}
          <div className="border-t border-slate-100 px-2.5 py-1 text-[10px] text-slate-400 bg-slate-50 whitespace-nowrap">
            Enter 或 Tab 补全
          </div>
        </div>
      )}

      {/* 划词优化菜单 */}
      {menu.visible && !locked && (
        <div className="absolute bg-[#1E293B] text-white p-1 rounded-md shadow-lg flex flex-wrap gap-1 z-50 max-w-[320px]" style={{ top: menu.top, left: menu.left }}>
          <button onClick={() => applyOptimize('academic')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">学术化</button>
          <button disabled={optimizing} onClick={() => applyOptimize('expand')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">扩写</button>
          <button disabled={optimizing} onClick={() => applyOptimize('shorten')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">精简</button>
        </div>
      )}

      {/* 划词优化差异对比 */}
      {diff.visible && (
        <div className={diffClass}>
          <div className="font-bold text-[#1E3A8A]">划词优化对比</div>
          <div className="leading-relaxed mt-1 space-y-0.5">
            <div><b>修改前：</b><span className="bg-[#FEE2E2] text-[#991B1B] line-through px-1">{diff.before}</span></div>
            <div><b>修改后：</b><span className="bg-[#D1FAE5] text-[#065F46] font-bold px-1">{diff.after}</span></div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={rejectDiff} className="px-2 py-0.5 rounded text-[10px] bg-slate-300 text-slate-700">拒绝</button>
            <button onClick={acceptDiff} className="px-2 py-0.5 rounded text-[10px] bg-[#1E3A8A] text-white">采纳</button>
          </div>
        </div>
      )}
    </div>
  );
}
