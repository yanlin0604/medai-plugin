import { Popover, Tag } from 'antd';
import type { RuntimeEvidenceSummaryDto } from '../../services/pluginRuntimeTypes';
import { resolveEvidenceCitation, splitCitationReferences, tokenizeCitationText } from '../../services/fieldAssist/evidenceCitations';

export interface EvidenceCitationTextProps {
  text: string;
  evidenceSummary?: readonly RuntimeEvidenceSummaryDto[];
}

function formatEvidenceTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function evidenceContent(evidence: RuntimeEvidenceSummaryDto): JSX.Element {
  const displaySourceSystem = evidence.sourceSystem?.toLowerCase() === 'cs-demo'
    ? '病历系统'
    : evidence.sourceSystem;
  const occurredAt = formatEvidenceTime(evidence.occurredAt);
  return (
    <div className="w-[360px] max-w-[85vw] flex flex-col text-[12px] leading-relaxed max-h-[60vh]">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 shrink-0">
        <div className="font-bold text-slate-800 flex-1 truncate mr-2" title={evidence.title}>{evidence.title || '证据来源'}</div>
        {displaySourceSystem ? <div className="text-[11px] text-slate-400 shrink-0">{displaySourceSystem}</div> : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-2 pb-1" onWheel={(event) => event.stopPropagation()}>
        {occurredAt ? (
          <div className="mb-2 text-[11px] text-slate-500">证据时间：{occurredAt}</div>
        ) : null}
        {evidence.summary ? (
          <div className="rounded-md bg-blue-50/80 p-2.5 text-blue-900 font-medium whitespace-pre-wrap border border-blue-100/50 shadow-sm leading-[1.6]">
            {evidence.summary}
          </div>
        ) : null}
        {evidence.originalText && evidence.originalText.trim() !== (evidence.summary || '').trim() ? (
          <details className="mt-3 text-[11px] text-slate-500 pb-1">
            <summary className="cursor-pointer hover:text-slate-700 select-none font-medium mb-1.5 outline-none transition-colors">
              展开完整上下文
            </summary>
            <div className="whitespace-pre-wrap pl-2.5 border-l-2 border-slate-200 mt-2 py-0.5">
              {evidence.originalText}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function EvidenceCitationText({ text, evidenceSummary = [] }: EvidenceCitationTextProps) {
  if (!text) return null;
  const parts = tokenizeCitationText(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.type !== 'citation') return <span key={index}>{part.value}</span>;
        const references = splitCitationReferences(part.value);
        if (!references.length || !evidenceSummary.length) return <span key={index}>{part.value}</span>;
        return (
          <span key={index} className="inline-flex items-center">
            <span>[</span>
            {references.map((reference, referenceIndex) => {
              const resolved = resolveEvidenceCitation(reference, evidenceSummary);
              const separator = referenceIndex ? <span key={`${index}-${referenceIndex}-separator`}>, </span> : null;
              if (!resolved) {
                return (
                  <span key={`${index}-${referenceIndex}`}>
                    {separator}{reference}
                  </span>
                );
              }
              return (
                <span key={`${index}-${referenceIndex}`}>
                  {separator}
                  <Popover content={evidenceContent(resolved.evidence)} trigger="click">
                    <Tag
                      color="blue"
                      className="mx-[1px] px-1 py-0 cursor-pointer hover:bg-blue-100 border-blue-200 leading-tight"
                      title="点击查看出处"
                    >
                      {resolved.displayNumber}
                    </Tag>
                  </Popover>
                </span>
              );
            })}
            <span>]</span>
          </span>
        );
      })}
    </>
  );
}
