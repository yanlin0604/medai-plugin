import { useCallback, useEffect, useState } from 'react';
import { fetchPublishedAgreement, type PublishedAgreement } from '../services/agreementService';

export type AgreementKind = 'privacy' | 'service';

interface LegalAgreementModalProps {
  kind: AgreementKind;
  onClose: () => void;
}

const TITLE_FALLBACK: Record<AgreementKind, string> = {
  privacy: '隐私协议',
  service: '服务协议',
};

function isHtmlText(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value);
}

function AgreementBody({ agreement }: { agreement: PublishedAgreement }) {
  const content = agreement.content.trim();

  if (!content) {
    return <p className="text-slate-500">暂无协议内容。</p>;
  }

  if (isHtmlText(content)) {
    return (
      <div
        className="agreement-rich-text"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  const paragraphs = content.split(/\n{2,}/);

  return (
    <div className="agreement-rich-text whitespace-pre-wrap">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`} className={index === 0 ? '' : 'mt-3'}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export default function LegalAgreementModal({ kind, onClose }: LegalAgreementModalProps) {
  const [agreement, setAgreement] = useState<PublishedAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgreement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPublishedAgreement(kind);
      setAgreement(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '协议内容获取失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    loadAgreement();
  }, [loadAgreement]);

  const title = agreement?.title?.trim() || TITLE_FALLBACK[kind];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="legal-agreement-title"
        aria-modal="true"
        className="max-h-[76vh] w-full max-w-[440px] overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="legal-agreement-title" className="text-sm font-bold text-slate-900">
            {title}
          </h2>
          <button
            aria-label="关闭协议"
            className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="custom-scrollbar max-h-[58vh] overflow-y-auto px-5 py-4 text-xs leading-6 text-slate-600">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1E3A8A]" />
              <span>协议内容加载中…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-slate-500">{error}</p>
              <button
                className="rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554]"
                onClick={loadAgreement}
                type="button"
              >
                重新加载
              </button>
            </div>
          ) : agreement ? (
            <AgreementBody agreement={agreement} />
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button
            className="rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554]"
            onClick={onClose}
            type="button"
          >
            我知道了
          </button>
        </div>
      </section>
    </div>
  );
}
