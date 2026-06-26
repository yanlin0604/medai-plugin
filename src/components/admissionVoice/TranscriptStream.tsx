import { useEffect, useRef } from 'react';
import type { AdmissionTranscriptSegment } from '../../services/admissionVoice/types';

interface Props {
  partialText: string;
  segments: AdmissionTranscriptSegment[];
}

export default function TranscriptStream({ partialText, segments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [partialText, segments]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-[11px] font-extrabold text-slate-700">实时转写</span>
        <span className="text-[10px] font-semibold text-slate-400">final 片段用于分析</span>
      </div>
      <div ref={containerRef} className="max-h-44 space-y-2 overflow-y-auto px-3 py-2">
        {segments.length === 0 && !partialText ? (
          <div className="py-6 text-center text-xs text-slate-400">等待语音识别文本</div>
        ) : null}

        {segments.map((segment) => (
          <div key={segment.id} className="rounded-md border border-emerald-100 bg-white px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
              <span>{segment.speaker}</span>
              <span>{new Date(segment.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            </div>
            <p className="break-words text-xs leading-5 text-slate-700">{segment.text}</p>
          </div>
        ))}

        {partialText ? (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold text-[#1E3A8A]">识别中</div>
            <p className="break-words text-xs leading-5 text-slate-600">{partialText}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
