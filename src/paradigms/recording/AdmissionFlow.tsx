import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { message, Modal } from 'antd';
import {
  AudioOutlined,
  ExpandAltOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import DocumentChatWorkspace from '../../components/clinical/DocumentChatWorkspace';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import AdmissionVoiceTray from '../../components/admissionVoice/AdmissionVoiceTray';
import { useHotkey } from '../../hooks/useHotkey';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
import { pluginRuntimeApi, toIcdItem } from '../../services/pluginRuntime';
import { renderDocument } from '../../services/clinicalService';
import { stripCitations } from '../../services/documentFlow';
import { saveDraft, loadDraft } from '../../services/draftService';
import {
  ADMISSION_DOCUMENT_FIELD_KEYS,
  type AdmissionCandidate,
  type TempPatientInfo,
} from '../../services/admissionVoice/types';
import { useAdmissionVoiceSession } from '../../services/admissionVoice/useAdmissionVoiceSession';
import { resolveAdmissionPatientMode } from '../../services/admissionVoice/patientMode';
import { applyTempPatientField } from '../../services/admissionVoice/tempPatient';
import type {
  DocFieldDef,
  DocTemplate,
  FieldValue,
  IcdItem,
  ClinicalSection,
  PatientBrief,
} from '../../services/types';
import type { RuntimeDocTemplateDto } from '../../services/pluginRuntimeTypes';

type PreviewMode = 'read' | 'edit';

const SECTION_EDITS_KEY = '__sectionEdits';
const HIDDEN_SECTIONS = new Set(['患者基本信息']);
const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const FIELD_EXTRACTION_WS_URL = String(import.meta.env.VITE_FIELD_EXTRACTION_WS_URL ?? '').trim();
const ADMISSION_DOCUMENT_FIELD_SET = new Set<string>(ADMISSION_DOCUMENT_FIELD_KEYS);

/** 将后端 RuntimeDocTemplateDto 转换为前端 DocTemplate */
function toDocTemplate(runtimeTemplate: RuntimeDocTemplateDto): DocTemplate {
  return {
    docCode: runtimeTemplate.docCode,
    version: runtimeTemplate.templateVersion,
    title: runtimeTemplate.title || runtimeTemplate.docName,
    fields: runtimeTemplate.fields.map((field): DocFieldDef => ({
      key: field.fieldKey,
      label: field.fieldLabel,
      section: field.sectionName,
      source: field.sourceType as any,
      required: field.required ?? false,
      inputType: field.inputType as any,
      options: field.options?.map(opt => ({
        value: opt.optionValue,
        label: opt.optionLabel,
        render: opt.renderText || opt.optionLabel,
      })),
      default: field.defaultValue,
      placeholder: field.placeholder,
      staticText: field.staticText,
      dictatable: field.dictatable ?? false,
    })),
  };
}

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
    case 'date':
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

function fieldTextValue(value: FieldValue | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => item.name).join('；');
  return '';
}

export default function AdmissionFlow({ doc }: ParadigmProps) {
  const [searchParams] = useSearchParams();
  const readOnlyEntry = searchParams.get('mode') === 'read';
  const { currentPatient } = usePatientStore();
  const patientMode = resolveAdmissionPatientMode(currentPatient);
  const [tempPatientInfo, setTempPatientInfo] = useState<TempPatientInfo>({});
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
        : {
          name: tempPatientInfo.name ?? '待建档患者',
          gender: tempPatientInfo.gender ?? '未录入',
          age: tempPatientInfo.age ?? '未录入',
          bed: '待分配',
          admissionNo: `TEMP-${doc.code}`,
          diagnosis: '待完善诊断',
        },
    [currentPatient, doc.code, tempPatientInfo.age, tempPatientInfo.gender, tempPatientInfo.name],
  );

  const admissionDate = currentPatient?.admissionDate ?? tempPatientInfo.admissionDate ?? '待建档';
  const deptName = currentPatient?.deptName ?? tempPatientInfo.deptName ?? '待分配';
  const doctor = currentPatient?.doctor ?? '林志远';
  const diagnosis = patient.diagnosis ?? '待完善诊断';

  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({});
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>(readOnlyEntry ? 'read' : 'edit');
  const [activeVoiceSectionKey, setActiveVoiceSectionKey] = useState('');
  const hydratedRef = useRef(false);
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
    patientId: patient.admissionNo,
    editor: `${doctor} 医师`,
  });

  useEffect(() => {
    let alive = true;
    hydratedRef.current = false;

    (async () => {
      try {
        // 调用后端接口获取模板和字段值
        const [runtimeTemplate, runtimeValues] = await Promise.all([
          pluginRuntimeApi.getRuntimeTemplate(doc.code),
          pluginRuntimeApi.resolveRuntimeValues(doc.code, patient.admissionNo, true),
        ]);

        if (!alive) return;

        // 转换为前端格式
        const tpl = toDocTemplate(runtimeTemplate);
        const backendValues = runtimeValues.values || {};
        const icdItems = (runtimeValues.icdCandidates || []).map(toIcdItem);

        const initialValues: Record<string, FieldValue> = {};
        tpl.fields.forEach((field) => {
          // 优先使用后端返回的值
          const backendVal = backendValues[field.key];
          if (backendVal !== undefined && backendVal !== null) {
            initialValues[field.key] = backendVal as unknown as FieldValue;
          } else if (field.key === 'patientInfo') {
            initialValues[field.key] = patientMode === 'new'
              ? '患者基本信息待建档，可先通过语音提取临时候选。'
              : `姓名：${patient.name}，性别：${patient.gender}，年龄：${patient.age}，入院诊断：${diagnosis}。`;
          } else if (field.key === 'treatmentPlan') {
            initialValues[field.key] = field.default ?? buildTreatmentPlan(diagnosis);
          } else if (field.inputType === 'options' || field.inputType === 'text' || field.inputType === 'date') {
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
      } catch (error) {
        if (!alive) return;
        console.error('加载入院记录模板失败:', error);
        message.error(error instanceof Error ? error.message : '加载模板失败');
      }
    })();

    return () => {
      alive = false;
    };
  }, [diagnosis, doc.code, patient.admissionNo, patient.age, patient.gender, patient.name, patientMode]);

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

  const editableSections = useMemo<ClinicalSection[]>(
    () =>
      visibleSections.map((section) => ({
        key: section.section,
        title: section.section,
        text: section.text,
        fieldKey: section.section,
        editable: true,
      })),
    [visibleSections],
  );

  const metaRows = useMemo<DocumentPaperMetaCell[][]>(
    () => [
      [
        { label: '姓名', value: patient.name },
        { label: '性别', value: patient.gender },
        { label: '年龄', value: patient.age },
      ],
      [
        { label: '婚姻', value: currentPatient ? '已婚' : tempPatientInfo.maritalStatus ?? '未录入' },
        { label: '职业', value: currentPatient ? '职员' : tempPatientInfo.occupation ?? '未录入' },
        { label: '出生地', value: currentPatient ? '广东' : tempPatientInfo.birthPlace ?? '未录入' },
      ],
      [
        { label: '入院日期', value: admissionDate },
        { label: '入院科室', value: deptName },
        { label: '记录医师', value: doctor },
      ],
    ],
    [
      admissionDate,
      currentPatient,
      deptName,
      doctor,
      patient.age,
      patient.gender,
      patient.name,
      tempPatientInfo.birthPlace,
      tempPatientInfo.maritalStatus,
      tempPatientInfo.occupation,
    ],
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
    () => visibleSections.map((section) => `【${section.section}】${stripCitations(section.text)}`).join('\n'),
    [visibleSections],
  );

  const finalFields = useMemo(
    () =>
      Object.fromEntries(
        fieldsForWriteback.map((field) => {
          const sectionOverride =
            sectionFieldCounts.get(field.section) === 1 ? sectionEdits[field.section] : undefined;
          return [field.key, stripCitations(renderWritebackValue(field, values[field.key], sectionOverride))];
        }),
      ),
    [fieldsForWriteback, sectionEdits, sectionFieldCounts, values],
  );

  const fieldOrder = useMemo(() => fieldsForWriteback.map((field) => field.key), [fieldsForWriteback]);
  const fieldLabels = useMemo(
    () => Object.fromEntries(fieldsForWriteback.map((field) => [field.key, field.label])),
    [fieldsForWriteback],
  );

  const fieldsByKey = useMemo(
    () => new Map(fieldsForWriteback.map((field) => [field.key, field])),
    [fieldsForWriteback],
  );

  const voiceableFields = useMemo(
    () => fieldsForWriteback.filter((field) => field.dictatable),
    [fieldsForWriteback],
  );

  const protectedVoiceFieldKeys = useMemo(
    () =>
      fieldsForWriteback
        .filter((field) =>
          ADMISSION_DOCUMENT_FIELD_SET.has(field.key)
          && (sectionEdits[field.section] != null || fieldTextValue(values[field.key]).trim()),
        )
        .map((field) => field.key),
    [fieldsForWriteback, sectionEdits, values],
  );

  const voicePreFilledFields = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(finalFields).filter(([, value]) => value.trim()),
      ),
    [finalFields],
  );

  const voiceSession = useAdmissionVoiceSession({
    enabled: !readOnlyEntry && !locked && !mismatch,
    docCode: doc.code,
    patientMode,
    patientId: null,
    patientIdHis: patientMode === 'existing' ? patient.admissionNo : null,
    asrWebSocketUrl: ASR_WS_URL,
    fieldExtractionWebSocketUrl: FIELD_EXTRACTION_WS_URL,
    preFilledFields: voicePreFilledFields,
    protectedDocumentFieldKeys: protectedVoiceFieldKeys,
    documentFieldLabels: fieldLabels,
  });
  const stopVoiceSession = voiceSession.stop;
  const disconnectVoiceAnalysis = voiceSession.disconnectAnalysis;

  const activeVoiceSectionLabel = useMemo(() => {
    const activeField = fieldsByKey.get(activeVoiceSectionKey);
    return activeField?.label ?? activeVoiceSectionKey;
  }, [activeVoiceSectionKey, fieldsByKey]);

  const sectionToolbarActions = useMemo(() => {
    const result: Record<string, ReactNode> = {};

    voiceableFields.forEach((field) => {
      const isActive = activeVoiceSectionKey === field.key;
      result[field.section] = (
        <button
          type="button"
          onClick={() => {
            setActiveVoiceSectionKey(field.key);
            void voiceSession.start();
          }}
          title={`语音输入 ${field.label}`}
          className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-bold transition-colors ${
            isActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-500 hover:border-[#1E3A8A] hover:text-[#1E3A8A]'
          }`}
        >
          <AudioOutlined />
          语音
        </button>
      );
    });

    return result;
  }, [activeVoiceSectionKey, voiceSession, voiceableFields]);

  const sectionSuffixes = useMemo(() => {
    const tagsBySection = new Map<string, ReactNode[]>();

    const addTag = (section: string, tag: ReactNode) => {
      tagsBySection.set(section, [...(tagsBySection.get(section) ?? []), tag]);
    };

    voiceableFields.forEach((field) => {
      addTag(
        field.section,
        <span key="voice" className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
          可语音
        </span>,
      );
    });
    const aiFields = fieldsForWriteback.filter((field) => field.source === 'ai' || field.inputType === 'icd');
    aiFields.forEach((field) => {
      addTag(
        field.section,
        <span key="ai" className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#1E3A8A]">
          可生成
        </span>,
      );
    });
    return Object.fromEntries(
      Array.from(tagsBySection.entries()).map(([section, tags]) => [
        section,
        <span className="inline-flex flex-wrap items-center gap-1">{tags}</span>,
      ]),
    );
  }, [fieldsForWriteback, voiceableFields]);

  const handleFocusSection = (sectionKey: string) => {
    const targetField = fieldsForWriteback.find((field) => field.section === sectionKey);
    setActiveVoiceSectionKey(targetField?.key ?? sectionKey);
  };

  useEffect(() => {
    if (readOnlyEntry || locked || mismatch) {
      stopVoiceSession(false);
      disconnectVoiceAnalysis();
    }
  }, [disconnectVoiceAnalysis, locked, mismatch, readOnlyEntry, stopVoiceSession]);

  useEffect(() => {
    if (readOnlyEntry || !hydratedRef.current || !template || locked) return;
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
  }, [doc.code, finalContent, locked, patient.admissionNo, readOnlyEntry, sectionEdits, template, values]);

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

  const applyDocumentVoiceCandidate = (candidate: AdmissionCandidate) => {
    const field = fieldsByKey.get(candidate.key);
    if (!field) return;

    setValues((prev) => ({
      ...prev,
      [candidate.key]: candidate.value,
    }));
    setSectionEdits((prev) => {
      const next = { ...prev };
      delete next[field.section];
      return next;
    });
  };

  const handleAcceptVoiceCandidate = (fieldKey: string) => {
    const candidate = voiceSession.candidates.documentFields[fieldKey];
    if (!candidate || locked || mismatch || readOnlyEntry) return;
    applyDocumentVoiceCandidate(candidate);
    voiceSession.markDocumentAccepted(fieldKey);
    message.success(`已采纳${candidate.label}候选。`);
  };

  const handleAcceptAllSafeVoiceCandidates = () => {
    const protectedKeys = new Set(protectedVoiceFieldKeys);
    const candidates = voiceSession.safeDocumentCandidates.filter((candidate) => !protectedKeys.has(candidate.key));
    if (!candidates.length) {
      message.info('暂无可一键采纳的无冲突候选。');
      return;
    }

    candidates.forEach(applyDocumentVoiceCandidate);
    voiceSession.markDocumentsAccepted(candidates.map((candidate) => candidate.key));
    message.success(`已采纳 ${candidates.length} 个无冲突候选。`);
  };

  const handleAcceptPatientCandidate = (fieldKey: string) => {
    const candidate = voiceSession.candidates.patientFields[fieldKey];
    if (!candidate || locked || mismatch || readOnlyEntry) return;
    setTempPatientInfo((prev) => applyTempPatientField(prev, fieldKey, candidate.value));
    voiceSession.markPatientAccepted(fieldKey);
    message.success(`已采纳${candidate.label}临时信息。`);
  };

  const doSubmit = async () => {
    await submit({
      fields: finalFields,
      fieldLabels,
      fieldOrder,
      content: finalContent,
      changeSummary: '医生确认提交入院记录',
      draftValues: {
        ...values,
        [SECTION_EDITS_KEY]: JSON.stringify(sectionEdits),
      },
      draftStep: 1,
    });
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
    if (patientMode === 'new') {
      message.error('新住院患者需先绑定 HIS 患者或完成建档，再提交正式入院记录。');
      return;
    }
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
      actions={!readOnlyEntry ? renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        () => {
          if (!versionCount) {
            message.info('提交后才会生成历史版本。');
            return;
          }
          openHistory();
        },
        '历史版本与修改记录',
      ) : null}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前入院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          {previewMode === 'read' ? (
          <DocumentPaper
              docName="入院记录"
              patient={patient}
              sections={editableSections}
              metaRows={metaRows}
            />
          ) : (
            <div className="flex min-h-full flex-col">
              <div className="flex-1 pb-40">
                <DocumentChatWorkspace
                  docName="入院记录"
                  patient={patient}
                  sections={editableSections}
                  metaRows={metaRows}
                  sectionBadgeLabel="病历段落"
                  sectionToolbarActions={sectionToolbarActions}
                  sectionSuffixes={sectionSuffixes}
                  actions={(
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!readOnlyEntry && renderActionButton(
                        <><ExpandAltOutlined />通读全文</>,
                        () => setPreviewMode('read'),
                      )}
                    </div>
                  )}
                  locked={locked}
                  sectionEdits={sectionEdits}
                  resetKeys={resetKeys}
                  onChange={updateSection}
                  onReset={resetSection}
                  onFocusSection={handleFocusSection}
                  optimize={optimizeText}
                />
              </div>

              <div className="sticky bottom-0 z-30">
                <AdmissionVoiceTray
                  status={voiceSession.status}
                  disabled={locked || mismatch || readOnlyEntry}
                  patientMode={patientMode}
                  activeSectionLabel={activeVoiceSectionLabel}
                  partialText={voiceSession.partialText}
                  segments={voiceSession.segments}
                  candidates={voiceSession.candidates}
                  safeDocumentCandidateCount={voiceSession.safeDocumentCandidates.length}
                  tempPatientInfo={tempPatientInfo}
                  asrError={voiceSession.asrError}
                  analysisError={voiceSession.analysisError}
                  analysisConnected={voiceSession.analysisConnected}
                  onStart={voiceSession.start}
                  onStop={() => voiceSession.stop(true)}
                  onClearTranscripts={voiceSession.clearTranscripts}
                  onAcceptDocument={handleAcceptVoiceCandidate}
                  onIgnoreDocument={voiceSession.ignoreDocumentCandidate}
                  onAcceptAllSafe={handleAcceptAllSafeVoiceCandidates}
                  onAcceptPatient={handleAcceptPatientCandidate}
                  onIgnorePatient={voiceSession.ignorePatientCandidate}
                />
              </div>
            </div>
          )}
        </div>

        {!readOnlyEntry && (
          <WritebackBar
            label="提交入院记录"
            onWriteback={handleSubmit}
            locked={locked}
            busy={submitting}
            busyText={submitText}
            progress={submitProgress}
            disabled={mismatch || patientMode === 'new'}
            onUnlock={() => {
              setLocked(false);
              message.info('已解除锁定，可重新编辑后再次提交。');
            }}
          />
        )}

        <VersionHistoryDrawer open={historyOpen} onClose={closeHistory} docCode={doc.code} patientId={patient.admissionNo} />
      </div>
    </ParadigmShell>
  );
}
