import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { message } from 'antd';
import { ThunderboltOutlined, UndoOutlined } from '@ant-design/icons';
import { suggestTerms } from '../../services/clinicalService';

interface Props {
  /** 段落名（如 主诉/现病史） */
  section: string;
  /** 段落正文（要素渲染值，或医生手动改写值） */
  text: string;
  /** 是否已手动改写（显示「重置本段」） */
  edited: boolean;
  locked?: boolean;
  readOnlyHint?: string;
  sectionSuffix?: ReactNode;
  density?: 'compact' | 'comfortable';
  /** 编辑回调：上提该段最新纯文本 */
  onChange: (text: string) => void;
  /** 重置本段（撤销手动改写，回到要素渲染值；由父级经 key remount 实现） */
  onReset: () => void;
  /** 划词优化实现（样例/真实 AI 由父注入） */
  optimize: (text: string, mode: string) => string;
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
export default function SectionEditor({ section, text, edited, locked, readOnlyHint, sectionSuffix, density = 'compact', onChange, onReset, optimize }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editedRef = useRef(false);
  const composingRef = useRef(false);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [html, setHtml] = useState(() => toHtml(text));
  const savedRange = useRef<Range | null>(null);
  const savedText = useRef('');
  const [menu, setMenu] = useState({ visible: false, top: 0, left: 0 });
  const [diff, setDiff] = useState({ visible: false, before: '', after: '' });
  const [sug, setSug] = useState<SugState>(EMPTY_SUG);
  const comfortable = density === 'comfortable';
  const titleClass = comfortable ? 'text-sm' : 'text-[11px]';
  const badgeClass = comfortable ? 'text-[11px]' : 'text-[9px]';
  const actionClass = comfortable ? 'text-xs' : 'text-[10px]';
  const editorClass = comfortable ? 'min-h-[96px] text-sm leading-7 px-3 py-2.5' : 'min-h-[52px] text-[11px] leading-relaxed px-2.5 py-1.5';

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

  const applyOptimize = (mode: string) => {
    setMenu((m) => ({ ...m, visible: false }));
    setDiff({ visible: true, before: savedText.current, after: optimize(savedText.current, mode) });
  };

  const polishSection = () => {
    const current = ref.current?.innerText.trim() ?? '';
    if (!current) {
      message.warning('当前段落为空，无法润色。');
      return;
    }
    savedRange.current = null;
    savedText.current = current;
    setDiff({ visible: true, before: current, after: optimize(current, 'polish') });
  };

  const acceptDiff = () => {
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
  };

  return (
    <div className="relative bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5 shadow-sm">
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`${titleClass} font-bold text-slate-700 truncate`}>{section}</span>
          {sectionSuffix}
          {readOnlyHint && <span className={`${badgeClass} font-normal px-1 rounded text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0]`}>{readOnlyHint}</span>}
        </div>
        {!locked && (
          <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={polishSection}
            title="对整段生成润色建议，采纳后才替换正文"
            className={`inline-flex items-center gap-1 ${actionClass} font-bold text-[#6D28D9] bg-[#F5F3FF] border border-[#DDD6FE] hover:bg-[#EDE9FE] rounded px-2 py-1 transition-colors`}
          >
            <ThunderboltOutlined />
            AI润色
          </button>
            {edited && (
              <button
                onClick={onReset}
                title="撤销手动修改，按要素重新生成本段"
                className={`inline-flex items-center gap-1 ${actionClass} text-slate-400 hover:text-[#854D0E]`}
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
        contentEditable={!locked}
        suppressContentEditableWarning
        onMouseUp={handleMouseUp}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          scheduleSuggest();
        }}
        onBlur={() => setTimeout(closeSug, 150)}
        dangerouslySetInnerHTML={{ __html: html }}
        className={`${editorClass} text-slate-700 outline-none bg-white border border-slate-200 rounded-md focus:border-[#1E3A8A] transition-colors`}
      />

      {/* 医疗术语输入联想 */}
      {sug.visible && !locked && (
        <div
          className="absolute z-50 bg-white border border-slate-200 rounded-md shadow-lg text-[11px] overflow-hidden min-w-[150px]"
          style={{ top: sug.top, left: sug.left }}
        >
          {sug.items.map((it, i) => (
            <div
              key={it}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptSuggest(it);
              }}
              className={`px-2.5 py-1.5 cursor-pointer whitespace-nowrap ${
                i === sug.index ? 'bg-[#F0F5FF] text-[#1E3A8A] font-semibold' : 'text-slate-600 hover:bg-slate-50'
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
        <div className="absolute bg-[#1E293B] text-white p-1 rounded-md shadow-lg flex gap-1 z-50" style={{ top: menu.top, left: menu.left }}>
          <button onClick={() => applyOptimize('academic')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">学术化</button>
          <button onClick={() => applyOptimize('expand')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">扩写</button>
          <button onClick={() => applyOptimize('shorten')} className="px-2 py-1 rounded text-[11px] font-bold hover:bg-white/15">精简</button>
        </div>
      )}

      {/* 划词优化差异对比 */}
      {diff.visible && (
        <div className="mt-2 bg-[#F0F5FF] border-[1.5px] border-[#93C5FD] rounded-lg p-2.5 text-[11.5px] animate-pop-up">
          <div className="font-bold text-[#1E3A8A]">划词优化对比</div>
          <div className="leading-relaxed mt-1 space-y-0.5">
            <div><b>修改前：</b><span className="bg-[#FEE2E2] text-[#991B1B] line-through px-1">{diff.before}</span></div>
            <div><b>修改后：</b><span className="bg-[#D1FAE5] text-[#065F46] font-bold px-1">{diff.after}</span></div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setDiff({ visible: false, before: '', after: '' })} className="px-2 py-0.5 rounded text-[10px] bg-slate-300 text-slate-700">拒绝</button>
            <button onClick={acceptDiff} className="px-2 py-0.5 rounded text-[10px] bg-[#1E3A8A] text-white">采纳</button>
          </div>
        </div>
      )}
    </div>
  );
}
