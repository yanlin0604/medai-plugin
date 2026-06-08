import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  ExpandAltOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import EditableDocumentPaper from '../../components/clinical/EditableDocumentPaper';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
import { saveDraft, loadDraft } from '../../services/draftService';
import { buildDischargeCase, type DischargeSection } from '../../services/samples/discharge';
import type { ClinicalSection, FieldValue, IcdItem, PatientBrief } from '../../services/types';

type PreviewMode = 'read' | 'edit';

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text} 请结合出院前复查结果及门诊随访计划进一步核对。`;
  if (mode === 'shorten') return text.length > 32 ? `${text.slice(0, Math.ceil(text.length * 0.65))}…` : text;
  if (mode === 'polish') return text.replace(/规律服药/g, '遵医嘱规律服药').replace(/及时就诊/g, '及时至急诊或专科门诊就诊');
  return text.replace(/胸痛/g, '心前区胸痛').replace(/复诊/g, '心内科门诊复诊');
}

export default function DischargeFlow({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const patient = currentPatient!;
  const patientBrief = useMemo<PatientBrief>(
    () => ({
      name: patient.name,
      gender: patient.gender,
      age: patient.age,
      bed: patient.bedNo,
      admissionNo: patient.id,
      diagnosis: patient.diagnosis,
    }),
    [patient.age, patient.bedNo, patient.diagnosis, patient.gender, patient.id, patient.name],
  );
  const dischargeCase = useMemo(() => buildDischargeCase(patient), [patient]);
  const baseSections = dischargeCase.sections;

  const [sections, setSections] = useState<DischargeSection[]>(baseSections);
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState<IcdItem[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const hydratedRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const {
    locked,
    setLocked,
    mismatch,
    historyOpen,
    openHistory,
    closeHistory,
    versionCount,
    submitting,
    submitText,
    submitProgress,
    submit,
  } = useDocumentSubmit({
    docCode: doc.code,
    docName: doc.name,
    patientId: patient.id,
    editor: '林志远 主治医师',
  });

  useEffect(() => {
    if (draftRestoredRef.current) return;
    const saved = loadDraft(doc.code, patient.id);
    if (saved) {
      setSections((prev) => prev.map((s) => ({ ...s, text: (saved.values[s.section] as string) ?? s.text })));
      setAcceptedDiagnoses((saved.values.dischargeDiagnoses as IcdItem[]) ?? []);
      if (saved.status === 'submitted') setLocked(true);
    } else {
      setSections(baseSections);
      setAcceptedDiagnoses([]);
      setLocked(false);
    }
    draftRestoredRef.current = true;
    hydratedRef.current = true;
  }, [baseSections, doc.code, patient.id]);

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
  };

  const editableSections = useMemo<ClinicalSection[]>(
    () =>
      sections.map((s) => ({
        key: s.section,
        title: s.section,
        text: s.text,
        fieldKey: FIELD_MAPPING[s.section] || s.section,
        editable: s.section !== '患者基本信息',
      })),
    [sections],
  );

  const editedSectionMap = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        sections
          .filter((s) => baseSections.find((base) => base.section === s.section)?.text !== s.text)
          .map((s) => [s.section, s.text]),
      ),
    [baseSections, sections],
  );

  const finalFields = useMemo(() => {
    const mapped: Record<string, string> = {};
    sections.forEach((s) => {
      const fieldKey = FIELD_MAPPING[s.section] || s.section;
      mapped[fieldKey] = s.text;
    });
    return mapped;
  }, [sections]);

  const fieldLabels = useMemo(
    () => Object.fromEntries(Object.entries(FIELD_MAPPING).map(([label, key]) => [key, label])),
    [],
  );

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

  const doSubmit = async () => {
    const values: Record<string, FieldValue> = Object.fromEntries(sections.map((s) => [s.section, s.text]));
    values.dischargeDiagnoses = acceptedDiagnoses;
    await submit({
      fields: finalFields,
      fieldLabels,
      content: finalContent,
      changeSummary: '医生确认提交出院记录',
      draftValues: values,
      draftStep: 1,
    });
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
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
          <p>
            患者 <b>{patient.name}</b> 的<b>{doc.name}</b>将提交。
          </p>
          <p className="mt-1.5 text-amber-600">正文已由医生核对，提交后生成历史版本。</p>
        </div>
      ),
      onOk: () => {
        void doSubmit();
      },
    });
  };

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
      showParadigmBadge={false}
      showPatientId={false}
      actions={renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        () => {
          if (!versionCount) {
            message.info('提交后才会生成历史版本。');
            return;
          }
          openHistory();
        },
        '历史版本与修改记录',
      )}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前出院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          {/* 出院记录 - 纸质格式 */}
          {previewMode === 'read' ? (
            <div className="max-w-5xl mx-auto px-8 py-6">
              {/* 标题 */}
              <div className="relative mb-6 flex items-center justify-center">
                <h1 className="text-2xl font-bold text-slate-900">出院记录</h1>
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  {renderActionButton(
                    <><ReloadOutlined />编辑</>,
                    () => setPreviewMode('edit'),
                    '编辑出院记录',
                  )}
                </div>
              </div>

              {/* 患者信息表格 - 多列布局 */}
              <div className="mb-6 text-sm border-2 border-slate-300">
                <div className="grid grid-cols-12 border-b border-slate-300">
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">姓名</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">{patient.name}</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">性别</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">{patient.gender}</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">年龄</div>
                  <div className="col-span-2 px-3 py-2">{patient.age}</div>
                </div>
                <div className="grid grid-cols-12 border-b border-slate-300">
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">婚姻</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">已婚</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">职业</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">职员</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">出生地</div>
                  <div className="col-span-2 px-3 py-2">广东</div>
                </div>
                <div className="grid grid-cols-12">
                  {sections.filter(s => s.section === '入院日期' || s.section === '出院日期' || s.section === '住院天数').map((s, idx) => (
                    <div key={s.section} className="contents">
                      <div className={`col-span-2 ${idx < 2 ? 'border-r' : ''} border-slate-300 px-3 py-2 bg-slate-50 font-bold`}>{s.section}</div>
                      <div className={`col-span-2 ${idx < 2 ? 'border-r' : ''} border-slate-300 px-3 py-2`}>{s.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 正文内容 - 大段文字 */}
              <div className="space-y-4 text-sm leading-7">
                {sections
                  .filter(s => !['入院日期', '出院日期', '住院天数'].includes(s.section))
                  .map((s) => {
                    return (
                      <div key={s.section}>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-bold text-slate-900">{s.section}：</span>
                        </div>
                        <div className="text-slate-700 whitespace-pre-wrap pl-4 leading-relaxed">{s.text || '（待填写）'}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <EditableDocumentPaper
                docName="出院记录"
                patient={patientBrief}
                sections={editableSections}
                actions={renderActionButton(
                  <><ExpandAltOutlined />通读全文</>,
                  () => setPreviewMode('read'),
                )}
                locked={locked}
                sectionEdits={editedSectionMap}
                onChange={updateSection}
                onReset={resetSection}
                optimize={optimizeText}
              />
            </div>
          )}
        </div>

        <WritebackBar
          label="提交出院记录"
          onWriteback={handleSubmit}
          locked={locked}
          busy={submitting}
          busyText={submitText}
          progress={submitProgress}
          onUnlock={() => {
            setLocked(false);
            message.info('已解除锁定，可重新编辑后再次提交。');
          }}
        />

        <VersionHistoryDrawer open={historyOpen} onClose={closeHistory} docCode={doc.code} patientId={patient.id} />
      </div>
    </ParadigmShell>
  );
}
