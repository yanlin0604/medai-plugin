import { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'antd';
import type { DocVersion, SectionDiff } from '../../services/types';
import { getDocVersions, getVersionDiff } from '../../services/versionService';
import DiffView from './DiffView';

interface Props {
  open: boolean;
  onClose: () => void;
  docCode: string;
  patientId: string;
}

// 'YYYY-MM-DDTHH:mm:ss' → 'MM-DD HH:mm'
const fmt = (iso: string) => {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : iso;
};

/**
 * 文书版本历史抽屉：时间线列出历次提交版本，选中版本即与上一版本逐段对比。
 * 复用 DiffView 呈现修改记录（红删绿增）。
 */
export default function VersionHistoryDrawer({ open, onClose, docCode, patientId }: Props) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [selectedNo, setSelectedNo] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const list = getDocVersions(docCode, patientId);
    setVersions(list);
    setSelectedNo(list.length ? list[0].versionNo : null);
  }, [open, docCode, patientId]);

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

  return (
    <Drawer
      title="历史版本与修改记录"
      placement="right"
      width={330}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 12 } }}
    >
      {versions.length === 0 ? (
        <div className="text-[11px] text-slate-400 text-center py-8">暂无历史版本，提交后将生成首个版本。</div>
      ) : (
        <div className="space-y-3">
          {/* 版本时间线 */}
          <div className="space-y-1.5">
            {versions.map((v) => {
              const active = v.versionNo === selectedNo;
              return (
                <button
                  key={v.versionNo}
                  onClick={() => setSelectedNo(v.versionNo)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                    active ? 'border-[#1E3A8A] bg-[#F0F5FF]' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-800">版本 V{v.versionNo}</span>
                    <span className="text-[10px] text-slate-400">{fmt(v.timestamp)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{v.editor}</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">{v.changeSummary}</div>
                </button>
              );
            })}
          </div>

          {/* 与上一版本差异 / 首版全文 */}
          {selected && (
            <div className="border-t border-dashed border-slate-200 pt-2.5">
              <div className="text-[11px] font-bold text-slate-600 mb-2">
                {isFirst ? `V${selected.versionNo} 为首个版本（全文）` : `V${selected.versionNo} 相对上一版本的修改`}
              </div>
              {isFirst ? (
                <div className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap bg-[#FAF8F5] border border-[#E9E3D5] rounded-lg p-2.5">
                  {selected.content}
                </div>
              ) : (
                <DiffView diffs={diffs} />
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
