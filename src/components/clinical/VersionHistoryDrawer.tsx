import { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { DocVersion, SectionDiff } from '../../services/types';
import {
  getVersionDiff,
  localVersionAdapter,
  type DocumentVersionAdapter,
} from '../../services/versionService';
import DiffView from './DiffView';

interface Props {
  open: boolean;
  onClose: () => void;
  docCode: string;
  patientId: string;
  versionAdapter?: DocumentVersionAdapter;
}

// 'YYYY-MM-DDTHH:mm:ss' → 'MM-DD HH:mm'
const fmt = (iso: string) => {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : iso;
};

const fmtFull = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
};

function parseContentSections(content: string) {
  const parts = content.split(/\n(?=【)/).map((part) => part.trim()).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^【(.+?)】([\s\S]*)$/);
    return match ? { title: match[1], text: match[2] } : { title: '', text: part };
  });
}

function VersionContentPaper({ content }: { content: string }) {
  const sections = parseContentSections(content);
  return (
    <article className="max-h-[520px] overflow-auto rounded-xl border border-[#E9E3D5] bg-[#FFFCF5] px-5 py-4 text-[12px] leading-[1.9] text-slate-700">
      {sections.map((section, index) => (
        <section
          key={`${section.title}-${index}`}
          className="border-b border-dashed border-[#E9E3D5] py-3 last:border-b-0 first:pt-0 last:pb-0"
        >
          {section.title && <div className="mb-1.5 font-bold text-slate-900">{section.title}：</div>}
          <p className="m-0 whitespace-pre-wrap pl-4">{section.text || '（空）'}</p>
        </section>
      ))}
    </article>
  );
}

/**
 * 文书版本历史抽屉：时间线列出历次提交版本，选中版本即与上一版本逐段对比。
 * 复用 DiffView 呈现修改记录（红删绿增）。
 */
export default function VersionHistoryDrawer({
  open,
  onClose,
  docCode,
  patientId,
  versionAdapter = localVersionAdapter,
}: Props) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [selectedNo, setSelectedNo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    versionAdapter
      .listVersions(docCode, patientId)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setSelectedNo(list.length ? list[0].versionNo : null);
      })
      .catch((error) => {
        if (cancelled) return;
        setVersions([]);
        setSelectedNo(null);
        setLoadError(error instanceof Error ? error.message : '历史版本加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, docCode, patientId, versionAdapter]);

  // 选中版本与其上一版本的差异（列表按版本号倒序，下一项是更早版本）
  const diffs: SectionDiff[] = useMemo(() => {
    if (selectedNo == null) return [];
    const idx = versions.findIndex((v) => v.versionNo === selectedNo);
    if (idx < 0) return [];
    const newer = versions[idx];
    const older = versions[idx + 1];
    return older ? getVersionDiff(older, newer) : [];
  }, [selectedNo, versions]);

  const selected = versions.find((v) => v.versionNo === selectedNo) ?? null;
  const isFirst = !!selected && versions[versions.length - 1]?.versionNo === selected.versionNo;
  const changedCount = diffs.filter((diff) => diff.changed).length;

  return (
    <Drawer
      title={(
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E3A8A] text-white">
            <HistoryOutlined />
          </span>
          <div>
            <div className="text-[15px] font-bold text-slate-900">历史版本与修改记录</div>
            <div className="text-[11px] font-medium text-slate-400">提交留痕 · 版本对比 · 审计追踪</div>
          </div>
        </div>
      )}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      styles={{
        header: { padding: '14px 18px', borderBottom: '1px solid #E5E7EB' },
        body: { padding: 0, background: '#F8FAFC' },
      }}
    >
      {loading ? (
        <div className="m-4 rounded-xl border border-slate-200 bg-white px-5 py-10 text-center">
          <ReloadOutlined className="animate-spin text-2xl text-[#1E3A8A]" />
          <div className="mt-3 text-sm font-bold text-slate-600">正在加载历史版本</div>
          <div className="mt-1 text-xs text-slate-400">正在从后台审计服务读取版本快照。</div>
        </div>
      ) : loadError ? (
        <div className="m-4 rounded-xl border border-red-100 bg-white px-5 py-10 text-center">
          <FileTextOutlined className="text-2xl text-red-300" />
          <div className="mt-3 text-sm font-bold text-red-700">历史版本加载失败</div>
          <div className="mt-1 break-words text-xs text-red-400">{loadError}</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <FileTextOutlined className="text-2xl text-slate-300" />
          <div className="mt-3 text-sm font-bold text-slate-600">暂无历史版本</div>
          <div className="mt-1 text-xs text-slate-400">提交后将自动生成首个版本快照。</div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400">版本总数</div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">{versions.length}</div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="text-[10px] font-bold text-blue-500">当前版本</div>
                <div className="mt-0.5 text-lg font-bold text-[#1E3A8A]">V{selected?.versionNo ?? '-'}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-[10px] font-bold text-emerald-600">修改段落</div>
                <div className="mt-0.5 text-lg font-bold text-emerald-700">{isFirst ? '首版' : changedCount}</div>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[178px_minmax(0,1fr)]">
            <div className="border-r border-slate-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-bold text-slate-500">版本时间线</div>
              <div className="space-y-2">
                {versions.map((v) => {
                  const active = v.versionNo === selectedNo;
                  return (
                    <button
                      key={v.versionNo}
                      onClick={() => setSelectedNo(v.versionNo)}
                      className={`group relative w-full rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'border-[#1E3A8A] bg-[#F0F5FF] shadow-[0_8px_20px_rgba(30,58,138,0.12)]'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[13px] font-bold ${active ? 'text-[#1E3A8A]' : 'text-slate-800'}`}>
                          V{v.versionNo}
                        </span>
                        {active ? (
                          <CheckCircleOutlined className="text-[13px] text-[#1E3A8A]" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-200 group-hover:bg-blue-300" />
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                        <ClockCircleOutlined />
                        {fmt(v.timestamp)}
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                        {v.changeSummary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected && (
              <div className="min-h-0 overflow-y-auto p-4">
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-bold text-slate-900">版本 V{selected.versionNo}</div>
                      <div className="mt-1 text-[12px] leading-relaxed text-slate-500">{selected.changeSummary}</div>
                    </div>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#1E3A8A]">
                      {isFirst ? '首版快照' : '修订记录'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
                      <UserOutlined className="mr-1 text-slate-400" />
                      {selected.editor}
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
                      <ClockCircleOutlined className="mr-1 text-slate-400" />
                      {fmtFull(selected.timestamp)}
                    </div>
                  </div>
                </section>

                <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                      <FileTextOutlined className="text-[#1E3A8A]" />
                      {isFirst ? '首版全文' : '与上一版本对比'}
                    </div>
                    {!isFirst && (
                      <span className="text-[10px] font-bold text-slate-400">{changedCount} 处修改</span>
                    )}
                  </div>
                  {isFirst ? (
                    <VersionContentPaper content={selected.content} />
                  ) : (
                    <DiffView diffs={diffs} />
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
