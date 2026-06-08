import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  AudioOutlined,
  ExpandAltOutlined,
  HistoryOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import SectionEditor from '../../components/clinical/SectionEditor';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import { useHotkey } from '../../hooks/useHotkey';
import { usePatientStore } from '../../stores/usePatientStore';
import { admissionPatient } from '../../services/samples/admission';
import { getDocTemplate, recommendIcd, renderDocument } from '../../services/clinicalService';
import { saveDraft, loadDraft } from '../../services/draftService';
import { appendVersion, getDocVersions } from '../../services/versionService';
import { submitDocument, watchPatientConsistency } from '../../services/emsBridge';
import type {
  DocFieldDef,
  DocTemplate,
  FieldValue,
  IcdItem,
  PatientBrief,
} from '../../services/types';

type PreviewMode = 'read' | 'edit';

const SECTION_EDITS_KEY = '__sectionEdits';
const HIDDEN_SECTIONS = new Set(['患者基本信息']);

function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text}（详见专科查体记录）`;
  if (mode === 'shorten') return text.length > 32 ? `${text.slice(0, Math.ceil(text.length * 0.65))}…` : text;
  if (mode === 'polish') return text.replace(/疼痛/g, '压榨样疼痛').replace(/待补充/g, '需结合后续检查结果进一步补充');
  return text.replace(/疼痛/g, '压榨样疼痛');
}

function buildTreatmentPlan(diagnosis: string): string {
  return [
    `结合目前病史、体征及辅助检查，初步考虑${diagnosis}相关急性冠脉事件。`,
    '完善心电监护、心肌酶谱动态复查、心脏超声及必要的冠脉评估。',
    '予抗血小板聚集、调脂稳定斑块、改善心肌供血及控制血压等治疗，严密观察胸痛、生命体征及心电变化。',
  ].join('');
}

function renderWritebackValue(
  field: DocFieldDef,
  value: FieldValue | undefined,
  sectionOverride?: string,
): string {
  if (sectionOverride != null) return sectionOverride.trim();
  switch (field.inputType) {
    case 'static':
      return ((value as string | undefined) ?? field.staticText ?? '').trim();
    case 'options': {
      const v = (value as string | undefined) ?? field.default ?? '';
      return field.options?.find((o) => o.value === v)?.render ?? '';
    }
    case 'text':
      return ((value as string | undefined) ?? field.default ?? '').trim();
    case 'icd': {
      const list = (value as IcdItem[] | undefined) ?? [];
      return Array.isArray(list) && list.length ? list.map((d, i) => `${i + 1}. ${d.name} [${d.code}]`).join('；') : '';
    }
    default:
      return '';
  }
}

function parseSectionEdits(value: FieldValue | undefined): Record<string, string> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function stripDraftMeta(values: Record<string, FieldValue>): Record<string, FieldValue> {
  const next = { ...values };
  delete next[SECTION_EDITS_KEY];
  return next;
}

export default function AdmissionFlow({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const patient: PatientBrief = useMemo(
    () =>
      currentPatient
        ? {
          name: currentPatient.name,
          gender: currentPatient.gender,
          age: currentPatient.age,
          bed: currentPatient.bedNo,
          admissionNo: currentPatient.id,
          diagnosis: currentPatient.diagnosis,
        }
        : admissionPatient,
    [currentPatient],
  );

  const admissionDate = currentPatient?.admissionDate ?? '2026-06-01';
  const deptName = currentPatient?.deptName ?? '心血管内科';
  const doctor = currentPatient?.doctor ?? '林志远';
  const diagnosis = patient.diagnosis ?? '待完善诊断';

  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({});
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [locked, setLocked] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitText, setSubmitText] = useState('');
  const [submitProgress, setSubmitProgress] = useState(0);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    hydratedRef.current = false;

    (async () => {
      const [tpl, icdItems] = await Promise.all([
        getDocTemplate(doc.code),
        recommendIcd(patient.admissionNo),
      ]);
      if (!alive || !tpl) return;

      const initialValues: Record<string, FieldValue> = {};
      tpl.fields.forEach((field) => {
        if (field.key === 'patientInfo') {
          initialValues[field.key] = `姓名：${patient.name}，性别：${patient.gender}，年龄：${patient.age}，入院诊断：${diagnosis}。`;
        } else if (field.key === 'treatmentPlan') {
          initialValues[field.key] = field.default ?? buildTreatmentPlan(diagnosis);
        } else if (field.inputType === 'options' || field.inputType === 'text') {
          initialValues[field.key] = field.default ?? '';
        } else if (field.inputType === 'icd') {
          initialValues[field.key] = icdItems;
        } else if (field.inputType === 'static') {
          initialValues[field.key] = field.staticText ?? '';
        }
      });

      const saved = loadDraft(doc.code, patient.admissionNo);
      setTemplate(tpl);
      if (saved) {
        setValues(stripDraftMeta(saved.values));
        setSectionEdits(parseSectionEdits(saved.values[SECTION_EDITS_KEY]));
        setLocked(saved.status === 'submitted');
      } else {
        setValues(initialValues);
        setSectionEdits({});
        setLocked(false);
      }
      hydratedRef.current = true;
    })();

    return () => {
      alive = false;
    };
  }, [diagnosis, doc.code, patient.admissionNo, patient.age, patient.gender, patient.name]);

  useEffect(() => {
    const stop = watchPatientConsistency(patient.admissionNo, (c) => setMismatch(!c.consistent));
    return stop;
  }, [patient.admissionNo]);

  useEffect(() => {
    setVersionCount(getDocVersions(doc.code, patient.admissionNo).length);
  }, [doc.code, patient.admissionNo, locked]);

  const rendered = useMemo(() => (template ? renderDocument(template, values) : null), [template, values]);

  const finalSections = useMemo(
    () =>
      (rendered?.sections ?? []).map((section) => ({
        section: section.section,
        text: sectionEdits[section.section] ?? section.text,
        edited: sectionEdits[section.section] != null,
      })),
    [rendered, sectionEdits],
  );

  const visibleSections = useMemo(
    () => finalSections.filter((section) => !HIDDEN_SECTIONS.has(section.section)),
    [finalSections],
  );

  const fieldsForWriteback = useMemo(
    () => template?.fields.filter((field) => field.key !== 'patientInfo') ?? [],
    [template],
  );

  const sectionFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    fieldsForWriteback.forEach((field) => {
      counts.set(field.section, (counts.get(field.section) ?? 0) + 1);
    });
    return counts;
  }, [fieldsForWriteback]);

  const finalContent = useMemo(
    () => visibleSections.map((section) => `【${section.section}】${section.text}`).join('\n'),
    [visibleSections],
  );

  const finalFields = useMemo(
    () =>
      Object.fromEntries(
        fieldsForWriteback.map((field) => {
          const sectionOverride =
            sectionFieldCounts.get(field.section) === 1 ? sectionEdits[field.section] : undefined;
          return [field.key, renderWritebackValue(field, values[field.key], sectionOverride)];
        }),
      ),
    [fieldsForWriteback, sectionEdits, sectionFieldCounts, values],
  );

  const fieldOrder = useMemo(() => fieldsForWriteback.map((field) => field.key), [fieldsForWriteback]);
  const fieldLabels = useMemo(
    () => Object.fromEntries(fieldsForWriteback.map((field) => [field.key, field.label])),
    [fieldsForWriteback],
  );

  const dictatableFields = useMemo(
    () => template?.fields.filter((field) => field.dictatable) ?? [],
    [template],
  );

  useEffect(() => {
    if (!hydratedRef.current || !template || locked) return;
    const t = window.setTimeout(() => {
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values: {
          ...values,
          [SECTION_EDITS_KEY]: JSON.stringify(sectionEdits),
        },
        content: finalContent,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [doc.code, finalContent, locked, patient.admissionNo, sectionEdits, template, values]);

  const updateSection = (section: string, text: string) => {
    setSectionEdits((prev) => ({ ...prev, [section]: text }));
  };

  const resetSection = (section: string) => {
    setSectionEdits((prev) => {
      const next = { ...prev };
      delete next[section];
      return next;
    });
    setResetKeys((prev) => ({ ...prev, [section]: (prev[section] ?? 0) + 1 }));
  };

  const applyDictation = () => {
    if (!dictatableFields.length) {
      message.info('当前模板暂无可口述段落。');
      return;
    }
    setValues((prev) => {
      const next = { ...prev };
      dictatableFields.forEach((field) => {
        next[field.key] = field.staticText ?? '';
      });
      return next;
    });
    setSectionEdits((prev) => {
      const next = { ...prev };
      dictatableFields.forEach((field) => {
        delete next[field.section];
      });
      return next;
    });
    setDictating(false);
    message.success('已根据口述填入主诉、现病史，请核对。');
  };

  const handleDictation = () => {
    if (dictating) {
      applyDictation();
      return;
    }
    setDictating(true);
  };

  const doSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitProgress(35);
    setSubmitText('提交中');

    try {
      const res = await submitDocument({
        docCode: doc.code,
        docName: doc.name,
        patientId: patient.admissionNo,
        fields: finalFields,
        fieldLabels,
        fieldOrder,
        content: finalContent,
      });
      if (!res.ok) {
        setSubmitProgress(100);
        setSubmitText('提交失败');
        message.error(res.message);
        return;
      }
      setSubmitProgress(90);
      setSubmitText('生成版本');
      const now = new Date().toISOString();
      setLocked(true);
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values: {
          ...values,
          [SECTION_EDITS_KEY]: JSON.stringify(sectionEdits),
        },
        content: finalContent,
        step: 1,
        status: 'submitted',
        updatedAt: now,
      });
      const version = appendVersion({
        docCode: doc.code,
        patientId: patient.admissionNo,
        content: finalContent,
        fields: finalFields,
        fieldLabels,
        editor: `${doctor} 医师`,
        timestamp: now,
        changeSummary: '医生确认提交入院记录',
      });
      setVersionCount((count) => Math.max(count + 1, version.versionNo));
      setSubmitProgress(100);
      setSubmitText('已提交');
      message.success(res.message);
    } finally {
      setSubmitting(false);
      setSubmitProgress(0);
      setSubmitText('');
    }
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止提交。请先在病历系统中切回当前患者。');
      return;
    }
    Modal.confirm({
      title: '确认提交入院记录？',
      width: 380,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>患者 <b>{patient.name}</b> 的<b>{doc.name}</b>将回写以下字段：</p>
          <ul className="mt-1.5 space-y-0.5 text-slate-600">
            {fieldsForWriteback.map((field) => <li key={field.key}>· {field.label}</li>)}
          </ul>
          <p className="mt-1.5 text-amber-600">正文已由医生核对后提交，提交后生成历史版本。</p>
        </div>
      ),
      onOk: () => {
        void doSubmit();
      },
    });
  };

  useHotkey('F8', () => {
    if (!locked) handleSubmit();
  });

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
          setHistoryOpen(true);
        },
        '历史版本与修改记录',
      )}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前入院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          {previewMode === 'read' ? (
            <div className="max-w-5xl mx-auto px-8 py-6">
              <div className="relative mb-6 flex items-center justify-center">
                <h1 className="text-2xl font-bold text-slate-900">入院记录</h1>
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  {renderActionButton(
                    <><ReloadOutlined />编辑</>,
                    () => setPreviewMode('edit'),
                    '编辑入院记录',
                  )}
                </div>
              </div>

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
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">入院日期</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">{admissionDate}</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">入院科室</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2">{deptName}</div>
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">记录医师</div>
                  <div className="col-span-2 px-3 py-2">{doctor}</div>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-7">
                {visibleSections.map((section) => (
                  <div key={section.section}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-bold text-slate-900">{section.section}：</span>
                    </div>
                    <div className="text-slate-700 whitespace-pre-wrap pl-4 leading-relaxed">{section.text || '（待填写）'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-700">编辑</span>
                <div className="flex items-center gap-2">
                  {!locked && renderActionButton(
                    dictating ? <><StopOutlined />结束并填入</> : <><AudioOutlined />口述病史</>,
                    handleDictation,
                    dictating ? '结束口述并填入主诉、现病史' : '开始口述病史',
                  )}
                  {renderActionButton(
                    <><ExpandAltOutlined />通读全文</>,
                    () => setPreviewMode('read'),
                  )}
                </div>
              </div>
              {dictating && (
                <div className="rounded-md border border-[#BFDBFE] bg-[#F0F5FF] px-3 py-2 text-xs font-semibold text-[#1E3A8A]">
                  正在聆听口述病史，说完点击“结束并填入”。
                </div>
              )}
              <div className="space-y-3">
                {visibleSections.map((section) => (
                  <SectionEditor
                    key={`${section.section}-${resetKeys[section.section] ?? 0}`}
                    section={section.section}
                    text={section.text}
                    edited={section.edited}
                    locked={locked}
                    density="comfortable"
                    onChange={(text) => updateSection(section.section, text)}
                    onReset={() => resetSection(section.section)}
                    optimize={optimizeText}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <WritebackBar
          label="提交入院记录"
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

        <VersionHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} docCode={doc.code} patientId={patient.admissionNo} />
      </div>
    </ParadigmShell>
  );
}
