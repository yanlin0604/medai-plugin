import { CloseOutlined, DatabaseOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Spin, Tag, Tooltip } from 'antd';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import type {
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceItemDto,
  RuntimeEvidenceSourceStatusDto,
} from '../../services/pluginRuntimeTypes';

interface EvidencePanelProps {
  bundle?: RuntimeEvidenceBundleDto | null;
  loading?: boolean;
  error?: string | null;
  title?: string;
  className?: string;
  variant?: 'panel' | 'tray';
  onInsertEvidence?: (item: RuntimeEvidenceItemDto, text: string) => void;
  onClose?: () => void;
}

interface ManualDragSession {
  pointerId: number;
  startX: number;
  startY: number;
  text: string;
  title: string;
  dragging: boolean;
}

interface DragGhost {
  x: number;
  y: number;
  title: string;
}

const SOURCE_LABELS: Record<string, string> = {
  HIS: 'HIS',
  LIS: 'LIS',
  EMR: 'EMR',
  PACS: 'PACS',
  RIS: 'RIS',
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  diagnosis: '诊断',
  order: '医嘱',
  medication: '用药',
  lab: '检验',
  exam: '检查',
  imaging: '影像',
  procedure: '操作',
  progress_note: '病程',
};

function formatDateTime(value?: string): string {
  if (!value) return '时间未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function evidenceDedupeKey(item: RuntimeEvidenceItemDto): string {
  return item.evidenceId?.trim()
    || [item.sourceSystem, item.evidenceType, item.occurredAt, item.title, item.summary].join('|');
}

function evidenceTypeLabel(type?: string): string {
  if (!type) return '资料';
  return EVIDENCE_TYPE_LABELS[type] ?? type;
}

function sourceLabel(source?: string): string {
  if (!source) return '未知来源';
  return SOURCE_LABELS[source] ?? source;
}

function fieldScopeLabel(fieldKey?: string): string {
  if (!fieldKey || fieldKey === 'all') return '整份文书';
  return fieldKey;
}

function statusColor(status?: string): string {
  switch (status) {
    case 'success':
      return 'green';
    case 'failed':
      return 'red';
    case 'disabled':
      return 'default';
    default:
      return 'gold';
  }
}

function abnormalColor(flag?: string): string {
  switch (flag) {
    case 'critical':
      return 'red';
    case 'abnormal':
      return 'orange';
    case 'normal':
      return 'green';
    default:
      return 'default';
  }
}

function abnormalLabel(flag?: string): string {
  switch (flag) {
    case 'critical':
      return '危急';
    case 'abnormal':
      return '异常';
    case 'normal':
      return '正常';
    case 'unknown':
      return '未标记';
    default:
      return flag ?? '未标记';
  }
}

export function formatEvidenceInsertText(item: RuntimeEvidenceItemDto): string {
  const header = `[${sourceLabel(item.sourceSystem)} ${evidenceTypeLabel(item.evidenceType)}] ${formatDateTime(item.occurredAt)}`;
  const title = item.title?.trim();
  const body = (item.summary || item.originalText || '').trim();
  return [header, title, body].filter(Boolean).join('\n');
}

function groupEvidence(items: RuntimeEvidenceItemDto[]): Array<[string, RuntimeEvidenceItemDto[]]> {
  const groups = new Map<string, RuntimeEvidenceItemDto[]>();
  items.forEach((item) => {
    const key = sourceLabel(item.sourceSystem);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.entries()].map(([source, sourceItems]) => [
    source,
    [...sourceItems].sort((left, right) => {
      const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
      const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
      return rightTime - leftTime;
    }),
  ]);
}

function SourceStatusStrip({ statuses }: { statuses?: RuntimeEvidenceSourceStatusDto[] }) {
  if (!statuses?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((status) => (
        <Tooltip key={`${status.sourceSystem}-${status.status}`} title={status.message || '来源状态'}>
          <Tag color={statusColor(status.status)} className="m-0 rounded-[4px] px-1 text-[10px] leading-4">
            {sourceLabel(status.sourceSystem)} · {status.evidenceCount ?? 0}
          </Tag>
        </Tooltip>
      ))}
    </div>
  );
}

export default function EvidencePanel({
  bundle,
  loading,
  error,
  title = '资料',
  className = '',
  variant = 'panel',
  onInsertEvidence,
  onClose,
}: EvidencePanelProps) {
  const evidenceItems = bundle?.evidenceItems ?? [];
  const groupedEvidence = useMemo(() => groupEvidence(evidenceItems), [evidenceItems]);
  const [activeSource, setActiveSource] = useState('全部');
  const trayItems = useMemo(
    () => (activeSource === '全部'
      ? evidenceItems
      : evidenceItems.filter((item) => sourceLabel(item.sourceSystem) === activeSource)),
    [activeSource, evidenceItems],
  );
  const manualDragRef = useRef<ManualDragSession | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);

  const canStartManualDrag = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return true;
    return !target.closest('button,summary,details,a,input,textarea,select');
  };

  const startManualDrag = (event: ReactPointerEvent<HTMLElement>, item: RuntimeEvidenceItemDto) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!canStartManualDrag(event.target)) return;
    manualDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      text: formatEvidenceInsertText(item),
      title: item.title || '资料',
      dragging: false,
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveManualDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = manualDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
    if (!session.dragging && moved < 6) return;
    session.dragging = true;
    event.preventDefault();
    setDragGhost({ x: event.clientX, y: event.clientY, title: session.title });
  };

  const endManualDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = manualDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    manualDragRef.current = null;
    setDragGhost(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // WebView 可能已提前释放 pointer capture。
    }
    if (!session.dragging) return;
    event.preventDefault();
    const dropTarget = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest('[data-section-editor-drop-target="true"]'))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    dropTarget?.dispatchEvent(new CustomEvent('medai-material-drop', {
      bubbles: true,
      detail: {
        text: session.text,
        clientX: event.clientX,
        clientY: event.clientY,
      },
    }));
  };

  const cancelManualDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (manualDragRef.current?.pointerId !== event.pointerId) return;
    manualDragRef.current = null;
    setDragGhost(null);
  };

  const renderDragGhost = () => dragGhost ? (
    <div
      className="pointer-events-none fixed z-[9999] max-w-[260px] rounded-md border border-[#93C5FD] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-lg"
      style={{ left: dragGhost.x + 12, top: dragGhost.y + 12 }}
    >
      {dragGhost.title}
    </div>
  ) : null;

  if (variant === 'tray') {
    const sources = ['全部', ...groupedEvidence.map(([source]) => source)];
    return (
      <aside className={`border-t border-slate-800 bg-[#0F172A] text-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] ${className}`}>
        <div className="flex h-[34px] items-center gap-2 border-b border-white/10 px-3">
          <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
            <DatabaseOutlined className="text-[#93C5FD]" />
            <span>{title}</span>
          </div>
          <span className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-200">
            {evidenceItems.length} 条
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {sources.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setActiveSource(source)}
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  activeSource === source
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white'
                }`}
              >
                {source}
              </button>
            ))}
          </div>
          {error && <span className="shrink-0 text-[10px] text-amber-200">{error}</span>}
        </div>

        <div className="h-[94px] px-3 py-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spin size="small" />
            </div>
          ) : trayItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">暂无可用资料</div>
          ) : (
            <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden pb-4">
              {trayItems.map((item) => {
                const insertText = formatEvidenceInsertText(item);
                return (
                  <article
                    key={evidenceDedupeKey(item)}
                    onPointerDown={(event) => startManualDrag(event, item)}
                    onPointerMove={moveManualDrag}
                    onPointerUp={endManualDrag}
                    onPointerCancel={cancelManualDrag}
                    title="拖动到正文任意位置，或点击加到当前段落末尾"
                    className="h-[58px] min-w-[190px] max-w-[240px] cursor-grab rounded-md border border-white/15 bg-white px-2 py-1 text-slate-900 shadow-sm transition-colors active:cursor-grabbing hover:border-[#93C5FD]"
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="shrink-0 rounded bg-[#EFF6FF] px-1 text-[10px] font-bold leading-4 text-[#1D4ED8]">
                            {sourceLabel(item.sourceSystem)}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] leading-4 text-slate-600">
                            {evidenceTypeLabel(item.evidenceType)}
                          </span>
                          <span className="min-w-0 truncate text-[10px] text-slate-400">{formatDateTime(item.occurredAt)}</span>
                        </div>
                        <div className="truncate text-[11px] font-bold leading-4 text-slate-900">{item.title || '未命名资料'}</div>
                        <div className="truncate text-[10px] leading-[14px] text-slate-500">{item.summary || item.originalText || '无摘要'}</div>
                      </div>
                      {onInsertEvidence && (
                        <button
                          type="button"
                          onClick={() => onInsertEvidence(item, insertText)}
                          className="mt-0.5 h-5 w-5 shrink-0 rounded bg-[#EFF6FF] text-[12px] font-bold leading-5 text-[#1D4ED8] hover:bg-[#DBEAFE]"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        {renderDragGhost()}
      </aside>
    );
  }

  return (
    <aside className={`bg-white border border-slate-200 rounded-md shadow-sm flex flex-col overflow-visible ${className}`}>
      <header className="px-2.5 py-1.5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <DatabaseOutlined className="text-[#1E3A8A]" />
            <span className="truncate">{title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            <span>{fieldScopeLabel(bundle?.fieldKey)}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>{evidenceItems.length} 条资料</span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="关闭资料面板"
            onClick={onClose}
            className="h-7 w-7 shrink-0 rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <CloseOutlined />
          </button>
        )}
      </header>

      <div className="px-2.5 py-1.5 border-b border-slate-100 space-y-1.5">
        <SourceStatusStrip statuses={bundle?.sourceStatuses} />
        {error && <Alert type="error" showIcon message={error} className="py-1.5 text-xs" />}
        {bundle?.warnings?.map((warning) => (
          <Alert
            key={warning}
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={warning}
            className="py-1.5 text-xs"
          />
        ))}
      </div>

      <div className="px-2 py-1.5">
        {loading ? (
          <div className="min-h-[160px] flex items-center justify-center">
            <Spin size="small" />
          </div>
        ) : evidenceItems.length === 0 ? (
          <div className="min-h-[160px] flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用资料" />
          </div>
        ) : (
          <div className="space-y-2">
            {groupedEvidence.map(([source, items]) => (
              <section key={source} className="space-y-1">
                <div className="bg-white/95 py-0.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">{source}</span>
                  <span className="text-[10px] text-slate-400">{items.length} 条</span>
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const insertText = formatEvidenceInsertText(item);
                    return (
                      <article
                        key={item.evidenceId}
                        onPointerDown={(event) => startManualDrag(event, item)}
                        onPointerMove={moveManualDrag}
                        onPointerUp={endManualDrag}
                        onPointerCancel={cancelManualDrag}
                        title="拖动到正文任意位置，或点击插入到当前段落末尾"
                        className="rounded border border-slate-200 border-l-2 bg-white px-2 py-1 transition-colors cursor-grab active:cursor-grabbing hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
                      >
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1">
                              <Tag color="blue" className="m-0 shrink-0 rounded-[4px] px-1 text-[10px] leading-4">
                                {evidenceTypeLabel(item.evidenceType)}
                              </Tag>
                              <Tag color={abnormalColor(item.abnormalFlag)} className="m-0 shrink-0 rounded-[4px] px-1 text-[10px] leading-4">
                                {abnormalLabel(item.abnormalFlag)}
                              </Tag>
                              <span className="min-w-0 truncate text-[10px] text-slate-400">{formatDateTime(item.occurredAt)}</span>
                            </div>
                            <h4 className="truncate text-[11px] font-bold text-slate-900 leading-5">{item.title || '未命名资料'}</h4>
                            {item.summary && (
                              <p
                                className="truncate text-[10px] leading-4 text-slate-600"
                              >
                                {item.summary}
                              </p>
                            )}
                            {item.originalText && (
                              <details className="mt-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                                <summary className="cursor-pointer select-none font-medium text-slate-600">原始记录</summary>
                                <p className="mt-1 whitespace-pre-wrap leading-5">{item.originalText}</p>
                              </details>
                            )}
                          </div>
                          {onInsertEvidence && (
                            <Button
                              size="small"
                              type="text"
                              icon={<PlusOutlined />}
                              onClick={() => onInsertEvidence(item, insertText)}
                              className="h-6 shrink-0 px-1 text-[#1E3A8A]"
                            >
                              加
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      {dragGhost && (
        renderDragGhost()
      )}
    </aside>
  );
}
