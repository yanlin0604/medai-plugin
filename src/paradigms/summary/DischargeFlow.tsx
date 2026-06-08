import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  CheckCircleOutlined,
  ExpandAltOutlined,
  FileDoneOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import SectionEditor from '../../components/clinical/SectionEditor';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import { useHotkey } from '../../hooks/useHotkey';
import { usePatientStore } from '../../stores/usePatientStore';
import { saveDraft, loadDraft } from '../../services/draftService';
import { appendVersion, getDocVersions } from '../../services/versionService';
import { submitDocument, watchPatientConsistency } from '../../services/emsBridge';
import { buildDischargeCase, type DischargeSection, type DischargePoint } from '../../services/samples/discharge';
import type { FieldValue, IcdItem } from '../../services/types';

type PreviewMode = 'read' | 'edit';

const SOURCE_STYLE: Record<DischargeSection['source'], string> = {
  HIS: 'text-[#166534] bg-[#F0FDF4] border-[#BBF7D0]',
  EMR: 'text-[#1E3A8A] bg-[#F0F5FF] border-[#BFDBFE]',
  LIS: 'text-[#B91C1C] bg-[#FFF5F5] border-[#FECDD3]',
  PACS: 'text-[#854D0E] bg-[#FFFBEB] border-[#FEF3C7]',
  医嘱: 'text-[#4338CA] bg-[#EEF2FF] border-[#C7D2FE]',
  AI: 'text-[#6D28D9] bg-[#F5F3FF] border-[#DDD6FE]',
};

const POINT_STYLE: Record<DischargePoint['tag'], string> = {
  primary: 'border-[#BFDBFE] bg-[#F0F5FF] text-[#1E3A8A]',
  warning: 'border-[#FEF3C7] bg-[#FFFBEB] text-[#854D0E]',
  danger: 'border-[#FECDD3] bg-[#FFF5F5] text-[#B91C1C]',
  success: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]',
};

const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合出院前复查结果及门诊随访计划进一步核对。`;
  if (mode === 'shorten') return text.length > 32 ? `${text.slice(0, Math.ceil(text.length * 0.65))}…` : text;
  if (mode === 'polish') return text.replace(/规律服药/g, '遵医嘱规律服药').replace(/及时就诊/g, '及时至急诊或专科门诊就诊');
  return text.replace(/胸痛/g, '心前区胸痛').replace(/复诊/g, '心内科门诊复诊');
}

function SourceBadge({ section }: { section: DischargeSection }) {
  return (
    <span className={`text-[9px] font-normal px-1 rounded border ${SOURCE_STYLE[section.source]}`}>
      {section.hint ?? section.source}
    </span>
  );
}

export default function DischargeFlow({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const patient = currentPatient!;
  const dischargeCase = useMemo(() => buildDischargeCase(patient), [patient]);
  const baseSections = dischargeCase.sections;

  const [sections, setSections] = useState<DischargeSection[]>(baseSections);
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState<IcdItem[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [locked, setLocked] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const hydratedRef = useRef(false);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    const saved = loadDraft(doc.code, patient.id);
    if (saved) {
      setSections((prev) => prev.map((s) => ({ ...s, text: (saved.values[s.section] as string) ?? s.text })));
      setAcceptedDiagnoses((saved.values.dischargeDiagnoses as IcdItem[]) ?? []);
      if (saved.status === 'submitted') setLocked(true);
      else message.info('已恢复上次未完成的草稿。');
    } else {
      setSections(baseSections);
      setAcceptedDiagnoses([]);
      setLocked(false);
    }
    draftRestoredRef.current = true;
    hydratedRef.current = true;
  }, [baseSections, doc.code, patient.id]);

  useEffect(() => {
    const stop = watchPatientConsistency(patient.id, (c) => setMismatch(!c.consistent));
    return stop;
  }, [patient.id]);

  useEffect(() => {
    setVersionCount(getDocVersions(doc.code, patient.id).length);
  }, [doc.code, patient.id, locked]);

  // 字段映射：DischargeFlow 中文段落名 -> BS DOC010 字段 key
  const FIELD_MAPPING: Record<string, string> = {
    '患者基本信息': 'patientInfo',
    '入院日期': 'admissionDate',
    '出院日期': 'dischargeDate',
    '入院情况': 'admissionCondition',
    '入院诊断': 'admissionDiagnosis',
    '诊疗经过': 'treatmentCourse',
    '出院诊断': 'dischargeDiagnosis',
    '出院情况': 'dischargeCondition',
    '出院医嘱': 'dischargeOrders',
    '医师签名': 'physicianSignature',
  };

  const finalFields = useMemo(() => {
    const mapped: Record<string, string> = {};
    sections.forEach((s) => {
      const fieldKey = FIELD_MAPPING[s.section] || s.section;
      mapped[fieldKey] = s.text;
    });
    return mapped;
  }, [sections]);

  const finalContent = useMemo(() => sections.map((s) => `【${s.section}】${s.text}`).join('\n'), [sections]);

  useEffect(() => {
    if (!hydratedRef.current || locked) return;
    const t = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(sections.map((s) => [s.section, s.text]));
      values.dischargeDiagnoses = acceptedDiagnoses;
      saveDraft({
        docCode: doc.code,
        patientId: patient.id,
        values,
        content: finalContent,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
      setSavedAt(new Date());
    }, 800);
    return () => window.clearTimeout(t);
  }, [acceptedDiagnoses, doc.code, finalContent, locked, patient.id, sections]);

  const updateSection = (section: string, text: string) => {
    setSections((prev) => prev.map((s) => (s.section === section ? { ...s, text } : s)));
  };

  const resetSection = (section: string) => {
    const base = baseSections.find((s) => s.section === section);
    if (!base) return;
    updateSection(section, base.text);
    if (section === '出院诊断') setAcceptedDiagnoses([]);
  };

  const toggleDiagnosis = (item: IcdItem) => {
    setAcceptedDiagnoses((prev) => {
      const exists = prev.some((d) => d.code === item.code);
      const next = exists ? prev.filter((d) => d.code !== item.code) : [...prev, item];
      const text = next.length
        ? next.map((d, idx) => `${idx + 1}. ${d.name}（${d.code}）`).join('\n')
        : '待确认出院诊断。';
      updateSection('出院诊断', text);
      return next;
    });
  };

  const generateAdvice = () => {
    if (!acceptedDiagnoses.length) {
      message.warning('请先确认至少一条出院诊断，再生成出院医嘱建议。');
      return;
    }
    setGeneratingAdvice(true);
    window.setTimeout(() => {
      updateSection('出院医嘱', dischargeCase.adviceSuggestion);
      setGeneratingAdvice(false);
      message.success('已生成出院医嘱建议，请医生审核修改。');
    }, 500);
  };

  const doSubmit = async () => {
    const res = await submitDocument({ docCode: doc.code, docName: doc.name, patientId: patient.id, fields: finalFields, content: finalContent });
    if (!res.ok) {
      message.error(res.message);
      return;
    }
    const now = new Date().toISOString();
    setLocked(true);
    const values: Record<string, FieldValue> = Object.fromEntries(sections.map((s) => [s.section, s.text]));
    values.dischargeDiagnoses = acceptedDiagnoses;
    saveDraft({ docCode: doc.code, patientId: patient.id, values, content: finalContent, step: 1, status: 'submitted', updatedAt: now });
    const version = appendVersion({
      docCode: doc.code,
      patientId: patient.id,
      content: finalContent,
      fields: finalFields,
      editor: '林志远 主治医师',
      timestamp: now,
      changeSummary: '医生确认并提交出院记录至病历系统',
    });
    setVersionCount((count) => Math.max(count + 1, version.versionNo));
    message.success(res.message);
  };

  const handleSubmit = () => {
    if (locked) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止提交。请先在病历系统中切回当前患者。');
      return;
    }
    Modal.confirm({
      title: '确认提交出院记录？',
      width: 380,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>患者 <b>{patient.name}</b>（住院号 {patient.id}）的<b>{doc.name}</b>将回写以下字段：</p>
          <ul className="mt-1.5 space-y-0.5 text-slate-600">
            {Object.keys(finalFields).map((k) => <li key={k}>· {k}</li>)}
          </ul>
          <p className="mt-1.5 text-amber-600">AI 生成内容已由医生核对后提交，提交后生成历史版本。</p>
        </div>
      ),
      onOk: doSubmit,
    });
  };

  useHotkey('F8', () => { if (!locked) handleSubmit(); });

  const renderActionButton = (children: ReactNode, onClick: () => void, title?: string) => (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 text-[11px] font-semibold border rounded-md px-2 py-1 text-slate-500 hover:text-[#1E3A8A] border-slate-200 hover:border-[#1E3A8A] transition-colors"
    >
      {children}
    </button>
  );

  return (
    <ParadigmShell
      doc={doc}
      actions={renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        () => {
          if (!versionCount) {
            message.info('提交后才会生成历史版本。');
            return;
          }
          setHistoryOpen(true);
        },
        '历史版本与修改记录',
      )}
    >
      <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前出院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          <section className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-slate-800">{patient.name}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{patient.gender} / {patient.age} · {patient.bedNo}</span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">拟出院核对</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">住院号 {patient.id} · 入院诊断：<span className="text-[#1E3A8A] font-semibold">{patient.diagnosis}</span></p>
              </div>
              {savedAt && <span className="text-[10px] text-slate-400 shrink-0">草稿已保存 {fmtTime(savedAt)}</span>}
            </div>
          </section>

          <section className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#166534] flex items-center gap-1.5"><FileDoneOutlined />住院全量资料已汇总</div>
              <span className="text-[10px] text-[#166534]">系统拉取 · 医生核对</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dischargeCase.pulledDocs.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#166534] bg-white border border-[#BBF7D0] rounded-full px-2 py-0.5">
                  <CheckCircleOutlined />{d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {dischargeCase.points.map((p) => (
                <div key={p.label} className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${POINT_STYLE[p.tag]}`}>
                  <div className="font-bold mb-0.5">{p.label}</div>
                  <div>{p.text}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-700">出院诊断确认 · ICD-10 勾选采纳</div>
              <button
                onClick={generateAdvice}
                disabled={generatingAdvice}
                className="text-[10px] font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] disabled:opacity-60 px-2.5 py-1 rounded-md transition-colors"
              >
                {generatingAdvice ? '生成中...' : 'AI生成出院医嘱建议'}
              </button>
            </div>
            <div className="space-y-1.5">
              {dischargeCase.icdCandidates.map((item) => {
                const checked = acceptedDiagnoses.some((d) => d.code === item.code);
                return (
                  <label key={item.code} className="flex items-center gap-2 text-[11px] bg-[#F8FAFC] border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggleDiagnosis(item)} className="accent-[#10B981] cursor-pointer" />
                    <span className="font-semibold text-slate-700 flex-1">{item.name}</span>
                    <span className="font-mono text-[#166534] bg-[#ECFDF5] px-1 rounded">{item.code}</span>
                    <span className="text-[#166534]">匹配度 {item.confidence}%</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">诊断与出院医嘱均为辅助建议，不自动采纳；医生勾选、编辑并确认后才会进入提交正文。</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>出院记录草稿 · 单页核对</span>
              {renderActionButton(
                <>{previewMode === 'read' ? <ReloadOutlined /> : <ExpandAltOutlined />}{previewMode === 'read' ? '分段编辑' : '通读全文'}</>,
                () => setPreviewMode((m) => (m === 'read' ? 'edit' : 'read')),
              )}
            </div>

            {previewMode === 'read' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 min-h-[160px] shadow-sm">
                <div className="text-center border-b border-slate-200 pb-2 mb-3">
                  <div className="text-sm font-extrabold text-slate-800">出院记录</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">系统汇总草稿 · 请核对完整正文</div>
                </div>
                <div className="space-y-3">
                  {sections.map((s) => {
                    const base = baseSections.find((b) => b.section === s.section);
                    const edited = !!base && base.text !== s.text;
                    return (
                      <section key={s.section} className="text-[12px] leading-relaxed">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="w-1 h-3 rounded-full bg-[#10B981]" />
                          <span className="font-bold text-[#166534]">{s.section}</span>
                          <SourceBadge section={s} />
                          {edited && <span className="text-[9px] text-[#854D0E] bg-[#FFFBEB] border border-[#FEF3C7] rounded px-1">已修改</span>}
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap pl-2.5 border-l border-slate-100">{s.text || '未填写'}</p>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-[#FFFDF5] border-[1.5px] border-[#FDE047] rounded-xl p-3.5 min-h-[160px] space-y-3">
                {!locked && <div className="text-[#854D0E] text-[10px] leading-relaxed border-b border-[#FEF08A] pb-1.5">每段可直接编辑、选中文字可优化；改动后可重置本段回到系统汇总内容。</div>}
                {sections.map((s) => {
                  const base = baseSections.find((b) => b.section === s.section);
                  const edited = !!base && base.text !== s.text;
                  return (
                    <SectionEditor
                      key={s.section}
                      section={s.section}
                      text={s.text}
                      edited={edited}
                      locked={locked || s.section === '患者基本信息'}
                      readOnlyHint={s.section === '患者基本信息' ? 'HIS同步' : undefined}
                      sectionSuffix={<SourceBadge section={s} />}
                      onChange={(text) => updateSection(s.section, text)}
                      onReset={() => resetSection(s.section)}
                      optimize={optimizeText}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <WritebackBar
          label="提交出院记录至病历系统 (F8)"
          onWriteback={handleSubmit}
          locked={locked}
          onUnlock={() => {
            setLocked(false);
            message.info('已解除锁定，可重新编辑后再次提交。');
          }}
        />

        <VersionHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} docCode={doc.code} patientId={patient.id} />
      </div>
    </ParadigmShell>
  );
}
