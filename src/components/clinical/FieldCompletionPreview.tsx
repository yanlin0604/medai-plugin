import {
  CheckCircleOutlined,
  CloseOutlined,
  EnterOutlined,
  FileTextOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Spin, Tag } from 'antd';
import { useMemo } from 'react';
import {
  applyFieldCompletionText,
  resolveCompletionWritebackMode,
  stripEvidenceCitationMarkers,
} from '../../services/evidenceCompletion';
import type {
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from '../../services/pluginRuntimeTypes';

interface FieldCompletionPreviewProps {
  response?: RuntimeFieldCompletionResponse | null;
  currentText?: string;
  loading?: boolean;
  applying?: boolean;
  error?: string | null;
  className?: string;
  onApply: (mode: RuntimeEvidenceWritebackMode, finalText: string) => void;
  onCancel?: () => void;
}

const WRITEBACK_ACTIONS: Array<{
  mode: RuntimeEvidenceWritebackMode;
  label: string;
  icon: JSX.Element;
}> = [
  { mode: 'fill', label: '填入', icon: <EnterOutlined /> },
  { mode: 'append', label: '追加', icon: <PlusOutlined /> },
  { mode: 'overwrite', label: '覆盖', icon: <FileTextOutlined /> },
];

function formatDateTime(value?: string): string {
  if (!value) return '时间未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function actionHint(mode: RuntimeEvidenceWritebackMode): string {
  switch (mode) {
    case 'fill':
      return '空字段首选';
    case 'overwrite':
      return '替换当前字段';
    default:
      return '保留原文追加';
  }
}

export default function FieldCompletionPreview({
  response,
  currentText = '',
  loading,
  applying,
  error,
  className = '',
  onApply,
  onCancel,
}: FieldCompletionPreviewProps) {
  const recommendedMode = useMemo(
    () => resolveCompletionWritebackMode(response, currentText),
    [currentText, response],
  );
  const draftText = useMemo(
    () => stripEvidenceCitationMarkers(response?.generatedText ?? ''),
    [response?.generatedText],
  );
  const finalTextByMode = useMemo(() => {
    const entries = WRITEBACK_ACTIONS.map(({ mode }) => [
      mode,
      applyFieldCompletionText(currentText, draftText, mode),
    ] as const);
    return Object.fromEntries(entries) as Record<RuntimeEvidenceWritebackMode, string>;
  }, [currentText, draftText]);

  return (
    <section className={`bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden ${className}`}>
      <header className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <CheckCircleOutlined className="text-emerald-600" />
            <span className="truncate">补全预览</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {response?.generationId ?? '等待生成结果'}
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            aria-label="关闭补全预览"
            onClick={onCancel}
            className="h-7 w-7 shrink-0 rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <CloseOutlined />
          </button>
        )}
      </header>

      <div className="space-y-3 px-3 py-3">
        {loading ? (
          <div className="min-h-[180px] flex items-center justify-center">
            <Spin size="small" />
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={error} className="text-xs" />
        ) : !response ? (
          <div className="min-h-[180px] flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无补全预览" />
          </div>
        ) : (
          <>
            {response.warnings?.map((warning) => (
              <Alert
                key={warning}
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message={warning}
                className="py-1.5 text-xs"
              />
            ))}

            <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700">草稿正文</span>
                <Tag color="blue" className="m-0 rounded-[4px] px-1.5 text-[10px] leading-5">
                  {response.responseTimeMs ?? 0}ms
                </Tag>
              </div>
              <p className="min-h-[72px] whitespace-pre-wrap text-[12px] leading-6 text-slate-800">
                {draftText || '证据不足，无法形成可靠补全建议。'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">证据摘要</span>
                <span className="text-[10px] text-slate-400">{response.usedEvidenceIds?.length ?? 0} 条</span>
              </div>
              {response.evidenceSummary?.length ? (
                <div className="space-y-1.5">
                  {response.evidenceSummary.map((item) => (
                    <div key={item.evidenceId} className="rounded-md border border-slate-200 px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag className="m-0 rounded-[4px] px-1.5 text-[10px] leading-5">{item.sourceSystem}</Tag>
                        <Tag color={item.abnormalFlag === 'critical' ? 'red' : item.abnormalFlag === 'abnormal' ? 'orange' : 'default'} className="m-0 rounded-[4px] px-1.5 text-[10px] leading-5">
                          {item.abnormalFlag ?? 'unknown'}
                        </Tag>
                        <span className="text-[10px] text-slate-400">{formatDateTime(item.occurredAt)}</span>
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-800">{item.title || item.evidenceType}</div>
                      {item.summary && <div className="mt-0.5 text-[11px] leading-5 text-slate-500">{item.summary}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-400">
                  未返回证据摘要
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {WRITEBACK_ACTIONS.map((action) => {
                const recommended = action.mode === recommendedMode;
                return (
                  <Button
                    key={action.mode}
                    type={recommended ? 'primary' : 'default'}
                    size="small"
                    icon={action.icon}
                    loading={applying && recommended}
                    onClick={() => onApply(action.mode, finalTextByMode[action.mode])}
                    className="h-auto min-h-10 whitespace-normal px-1.5 py-1"
                  >
                    <span className="flex flex-col leading-tight">
                      <span>{action.label}</span>
                      <span className="text-[10px] opacity-70">{actionHint(action.mode)}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
