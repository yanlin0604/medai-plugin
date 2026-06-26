import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { message, Modal } from 'antd';
import {
  HistoryOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import type { DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import DocumentChatWorkspace from '../../components/clinical/DocumentChatWorkspace';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import type { SectionRewriteStatus } from '../../components/clinical/SectionEditor';
import AdmissionVoiceTray from '../../components/admissionVoice/AdmissionVoiceTray';
import { useHotkey } from '../../hooks/useHotkey';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import { buildSubmitSnapshot } from '../../services/documentFlow';
import { saveDraft, loadDraft } from '../../services/draftService';
import { backendRuntimeVersionAdapter } from '../../services/versionService';
import {
  applyAdmissionFieldAutomation,
  clearAdmissionRuntimeCache,
  isAdmissionMetaSection,
  loadAdmissionRuntime,
  loadAdmissionRuntimeField,
  loadAdmissionRuntimeTemplate,
  loadAdmissionRuntimeValues,
  type AdmissionRuntimeState,
} from '../../services/admissionRuntime';
import {
  ADMISSION_DOCUMENT_FIELD_KEYS,
  type AdmissionCandidate,
  type TempPatientInfo,
} from '../../services/admissionVoice/types';
import { useAdmissionVoiceSession } from '../../services/admissionVoice/useAdmissionVoiceSession';
import { resolveAdmissionPatientMode } from '../../services/admissionVoice/patientMode';
import { applyTempPatientField } from '../../services/admissionVoice/tempPatient';
import type {
  ClinicalSection,
  FieldValue,
  IcdItem,
  PatientBrief,
} from '../../services/types';
import type {
  RuntimeRewriteType,
} from '../../services/pluginRuntimeTypes';

const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const FIELD_EXTRACTION_WS_URL = String(import.meta.env.VITE_FIELD_EXTRACTION_WS_URL ?? '').trim();
const ADMISSION_DOCUMENT_FIELD_SET = new Set<string>(ADMISSION_DOCUMENT_FIELD_KEYS);

function toRuntimeRewriteType(mode: string): RuntimeRewriteType {
  if (mode === 'polish' || mode === 'academic' || mode === 'expand' || mode === 'shorten') return mode;
  return 'custom';
}

function candidateStatusLabel(status: AdmissionCandidate['status']): string {
  switch (status) {
    case 'accepted': return '已采纳';
    case 'ignored': return '已忽略';
    case 'conflict': return '需确认';
    default: return '待确认';
  }
}

function readSavedSectionText(
  values: Record<string, FieldValue>,
  section: ClinicalSection,
): string | undefined {
  const value = values[section.key] ?? values[section.title];
  return typeof value === 'string' ? value : undefined;
}

function shouldRestoreSavedText(savedText: string | undefined, runtimeText: string): savedText is string {
  if (savedText === undefined) return false;
  return savedText.trim().length > 0 || runtimeText.trim().length === 0;
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

  // ==================== 运行时状态（对齐出院记录） ====================
  const [runtimeState, setRuntimeState] = useState<AdmissionRuntimeState | null>(null);
  const [sections, setSections] = useState<ClinicalSection[]>([]);
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState<IcdItem[]>([]);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeValuesLoading, setRuntimeValuesLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [runtimeRegenerating, setRuntimeRegenerating] = useState(false);
  const [regeneratingSectionKey, setRegeneratingSectionKey] = useState<string | null>(null);
  const [sectionResetKeys, setSectionResetKeys] = useState<Record<string, number>>({});
  const [activeVoiceSectionKey, setActiveVoiceSectionKey] = useState('');
  const hydratedRef = useRef(false);
  const templateSectionTextsRef = useRef<Record<string, string>>({});

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
    versionAdapter: backendRuntimeVersionAdapter,
  });

  // ==================== 运行时加载（对齐出院记录渐进式加载） ====================
  const applyRuntimeState = useCallback((
    runtime: AdmissionRuntimeState,
    options: { restoreDraft: boolean },
  ) => {
    const saved = options.restoreDraft ? loadDraft(doc.code, patient.admissionNo) : null;
    const restoredSections = saved
      ? runtime.sections.map((section) => {
          const savedText = readSavedSectionText(saved.values, section);
          return {
            ...section,
            text: shouldRestoreSavedText(savedText, section.text) ? savedText : section.text,
          };
        })
      : runtime.sections;

    setRuntimeState(runtime);
    setSections(applyAdmissionFieldAutomation(restoredSections));
    setAcceptedDiagnoses(
      saved ? (saved.values.admissionDiagnoses as IcdItem[] | undefined) ?? runtime.icdCandidates : runtime.icdCandidates,
    );
    setLocked(saved?.status === 'submitted');
    hydratedRef.current = true;
  }, [doc.code, patient.admissionNo, setLocked]);

  const applyRuntimeValues = useCallback((runtime: AdmissionRuntimeState) => {
    const saved = loadDraft(doc.code, patient.admissionNo);
    const savedValues = saved?.values ?? {};
    const baselineTexts = templateSectionTextsRef.current;

    setRuntimeState(runtime);
    setSections((currentSections) => {
      const currentByKey = new Map(currentSections.map((section) => [section.key, section]));
      const nextSections = runtime.sections.map((section) => {
        const savedText = readSavedSectionText(savedValues, section);
        if (shouldRestoreSavedText(savedText, section.text)) {
          return { ...section, text: savedText };
        }

        const current = currentByKey.get(section.key);
        if (!current) return section;
        const baselineText = baselineTexts[section.key] ?? '';
        const currentText = current.text ?? '';
        return currentText && currentText !== baselineText ? { ...section, text: currentText } : section;
      });
      return applyAdmissionFieldAutomation(nextSections);
    });
    setAcceptedDiagnoses((current) => (current.length ? current : runtime.icdCandidates));
  }, [doc.code, patient.admissionNo]);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setRuntimeLoading(true);
    setRuntimeValuesLoading(false);
    setRuntimeError('');
    setRuntimeState(null);
    setSections([]);
    setSectionResetKeys({});
    setAcceptedDiagnoses([]);
    setRuntimeRegenerating(false);
    setRegeneratingSectionKey(null);

    if (reloadToken > 0) {
      clearAdmissionRuntimeCache(doc.code, patient.admissionNo);
    }

    loadAdmissionRuntimeTemplate(doc.code, patient.admissionNo, patient)
      .then((runtime) => {
        if (cancelled) return;
        templateSectionTextsRef.current = Object.fromEntries(
          runtime.sections.map((section) => [section.key, section.text]),
        );
        applyRuntimeState(runtime, { restoreDraft: true });
        setRuntimeLoading(false);
        setRuntimeValuesLoading(true);
        return loadAdmissionRuntimeValues(doc.code, patient.admissionNo, patient, runtime.template, { skipGeneration: true });
      })
      .then((runtime) => {
        if (cancelled || !runtime) return;
        applyRuntimeValues(runtime);
        setRuntimeValuesLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeValuesLoading(false);
        const messageText = error instanceof Error ? error.message : '入院记录模板或字段取值加载失败';
        if (hydratedRef.current) {
          message.warning(`字段取值加载失败：${messageText}`);
          return;
        }
        setRuntimeError(messageText);
        setLocked(false);
        setRuntimeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    doc.code,
    patient.admissionNo,
    patient,
    reloadToken,
  ]);

  // ==================== 段落编辑（对齐出院记录） ====================
  const updateSection = useCallback((sectionKey: string, text: string) => {
    setSections((prev) => applyAdmissionFieldAutomation(
      prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)),
    ));
  }, []);

  const bumpSectionResetKey = useCallback((sectionKey: string) => {
    setSectionResetKeys((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] ?? 0) + 1,
    }));
  }, []);

  const bumpSectionResetKeys = useCallback((sectionKeys: string[]) => {
    setSectionResetKeys((prev) => {
      const next = { ...prev };
      sectionKeys.forEach((sectionKey) => {
        next[sectionKey] = (next[sectionKey] ?? 0) + 1;
      });
      return next;
    });
  }, []);

  // ==================== meta / body 段落分离（对齐出院记录） ====================
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

  const bodySections = useMemo<ClinicalSection[]>(
    () => sections.filter((section) => !isAdmissionMetaSection(section, runtimeState?.metaFieldKeys ?? [])),
    [runtimeState?.metaFieldKeys, sections],
  );

  const templateTitle = runtimeState?.template.title || doc.name;

  const editedSectionMap = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        sections
          .filter((section) => runtimeState?.sections.find((base) => base.key === section.key)?.text !== section.text)
          .map((section) => [section.key, section.text]),
      ),
    [runtimeState?.sections, sections],
  );

  const submitSnapshot = useMemo(
    () =>
      buildSubmitSnapshot({
        sections: bodySections,
        changeSummary: '医生确认提交入院记录',
        includeEmptySections: true,
      }),
    [bodySections],
  );

  const finalContent = submitSnapshot.content;

  // ==================== 草稿自动保存 ====================
  useEffect(() => {
    if (readOnlyEntry || !hydratedRef.current || locked) return;
    const t = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
      values.admissionDiagnoses = acceptedDiagnoses;
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values,
        content: finalContent,
        step: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [acceptedDiagnoses, doc.code, finalContent, locked, patient.admissionNo, sections]);

  // ==================== 段落操作（对齐出院记录） ====================
  const resetSection = (sectionKey: string) => {
    const base = runtimeState?.sections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    bumpSectionResetKey(sectionKey);
  };

  const regenerateAllSections = useCallback(async () => {
    if (runtimeRegenerating) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止重新生成。请先在病历系统中切回当前患者。');
      return;
    }
    if (locked) {
      message.warning('当前文书已锁定，请先解除锁定后再重新生成。');
      return;
    }
    if (runtimeValuesLoading) {
      message.warning('字段内容正在加载，请稍后。');
      return;
    }

    setRuntimeRegenerating(true);
    setRegeneratingSectionKey(null);

    try {
      clearAdmissionRuntimeCache(doc.code, patient.admissionNo);
      const runtime = await loadAdmissionRuntime(doc.code, patient.admissionNo, patient, { forceRefresh: true });
      applyRuntimeState(runtime, { restoreDraft: false });
      bumpSectionResetKeys(runtime.sections.map((section) => section.key));
      message.success('已重新生成全部字段。');
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '入院记录字段重新生成失败';
      message.error(messageText);
    } finally {
      setRuntimeRegenerating(false);
    }
  }, [
    applyRuntimeState,
    bumpSectionResetKeys,
    doc.code,
    locked,
    mismatch,
    patient,
    runtimeRegenerating,
    runtimeValuesLoading,
  ]);

  const regenerateSection = useCallback(async (sectionKey: string) => {
    if (!runtimeState || runtimeRegenerating || regeneratingSectionKey) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止重新生成。请先在病历系统中切回当前患者。');
      return;
    }
    if (locked) {
      message.warning('当前文书已锁定，请先解除锁定后再重新生成。');
      return;
    }
    if (runtimeValuesLoading) {
      message.warning('字段内容正在加载，请稍后。');
      return;
    }

    const currentSection = sections.find((section) => section.key === sectionKey);
    if (!currentSection?.editable) {
      message.warning('当前字段不可编辑，不能单独重新生成。');
      return;
    }

    setRegeneratingSectionKey(sectionKey);
    try {
      const fieldState = await loadAdmissionRuntimeField(doc.code, patient.admissionNo, sectionKey, runtimeState.template);
      const generatedValue = fieldState.values.values?.[sectionKey];
      setRuntimeState((current) => {
        if (!current) return current;
        return {
          ...current,
          values: {
            ...current.values,
            values: {
              ...(current.values.values ?? {}),
              ...(generatedValue ? { [sectionKey]: generatedValue } : {}),
            },
            pulledSources: fieldState.values.pulledSources,
            resolvedAt: fieldState.values.resolvedAt,
          },
          sections: current.sections.map((section) => (section.key === sectionKey ? fieldState.section : section)),
          readOnlyHints: {
            ...current.readOnlyHints,
            [sectionKey]: fieldState.readOnlyHint,
          },
          icdCandidates: sectionKey === 'admissionDiagnosis' ? fieldState.icdCandidates : current.icdCandidates,
        };
      });
      setSections((current) => applyAdmissionFieldAutomation(
        current.map((section) => (section.key === sectionKey ? fieldState.section : section)),
      ));
      if (sectionKey === 'admissionDiagnosis') {
        setAcceptedDiagnoses(fieldState.icdCandidates);
      }
      bumpSectionResetKey(sectionKey);
      message.success(`已重新生成${fieldState.section.title}`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '字段重新生成失败';
      message.error(messageText);
    } finally {
      setRegeneratingSectionKey(null);
    }
  }, [
    bumpSectionResetKey,
    doc.code,
    locked,
    mismatch,
    patient.admissionNo,
    regeneratingSectionKey,
    runtimeRegenerating,
    runtimeState,
    runtimeValuesLoading,
    sections,
  ]);

  const rewriteSectionText = async (section: ClinicalSection, text: string, mode: string) => {
    const result = await pluginRuntimeApi.rewriteText({
      docCode: doc.code,
      patientIdHis: patient.admissionNo,
      sectionKey: section.key,
      rewriteType: toRuntimeRewriteType(mode),
      selectedText: text,
    });
    return {
      requestId: result.requestId,
      before: result.before,
      after: result.after,
    };
  };

  const updateRewriteStatus = async (
    requestId: string | number,
    status: SectionRewriteStatus,
  ) => {
    await pluginRuntimeApi.updateRewriteStatus(requestId, status);
  };

  // ==================== 语音功能（入院记录独有） ====================
  const fieldsByKey = useMemo(() => {
    if (!runtimeState) return new Map<string, ClinicalSection>();
    return new Map(runtimeState.sections.map((section) => [section.key, section]));
  }, [runtimeState]);

  const voiceFieldLabels = useMemo(() => {
    if (!runtimeState) return {};
    return Object.fromEntries(runtimeState.sections.map((section) => [section.key, section.title]));
  }, [runtimeState]);

  const protectedVoiceFieldKeys = useMemo(
    () =>
      sections
        .filter((section) =>
          ADMISSION_DOCUMENT_FIELD_SET.has(section.key)
          && section.text.trim(),
        )
        .map((section) => section.key),
    [sections],
  );

  const voicePreFilledFields = useMemo(
    () =>
      Object.fromEntries(
        submitSnapshot.fields
          ? Object.entries(submitSnapshot.fields).filter(([, value]) => value.trim())
          : [],
      ),
    [submitSnapshot.fields],
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
    documentFieldLabels: voiceFieldLabels,
  });
  const stopVoiceSession = voiceSession.stop;
  const disconnectVoiceAnalysis = voiceSession.disconnectAnalysis;

  const activeVoiceSectionLabel = useMemo(() => {
    const activeField = fieldsByKey.get(activeVoiceSectionKey);
    return activeField?.title ?? activeVoiceSectionKey;
  }, [activeVoiceSectionKey, fieldsByKey]);

  const handleFocusSection = (sectionKey: string) => {
    setActiveVoiceSectionKey(sectionKey);
  };

  useEffect(() => {
    if (readOnlyEntry || locked || mismatch) {
      stopVoiceSession(false);
      disconnectVoiceAnalysis();
    }
  }, [disconnectVoiceAnalysis, locked, mismatch, readOnlyEntry, stopVoiceSession]);

  const applyDocumentVoiceCandidate = useCallback((candidate: AdmissionCandidate) => {
    updateSection(candidate.key, candidate.value);
    bumpSectionResetKey(candidate.key);
  }, [updateSection, bumpSectionResetKey]);

  const handleAcceptVoiceCandidate = useCallback((fieldKey: string) => {
    const candidate = voiceSession.candidates.documentFields[fieldKey];
    if (!candidate || locked || mismatch || readOnlyEntry) return;
    applyDocumentVoiceCandidate(candidate);
    voiceSession.markDocumentAccepted(fieldKey);
    message.success(`已采纳${candidate.label}候选。`);
  }, [voiceSession, locked, mismatch, readOnlyEntry, applyDocumentVoiceCandidate]);

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

  const sectionBottomNodes = useMemo(() => {
    const nodes: Record<string, ReactNode> = {};
    const groupedCandidates = new Map<string, AdmissionCandidate[]>();
    
    Object.values(voiceSession.candidates.documentFields).forEach((candidate) => {
      const field = fieldsByKey.get(candidate.key);
      if (field) {
        const section = field.key;
        const list = groupedCandidates.get(section) || [];
        list.push(candidate);
        groupedCandidates.set(section, list);
      }
    });

    for (const [section, candidates] of groupedCandidates.entries()) {
      if (candidates.length === 0) continue;
      
      nodes[section] = (
        <div className="flex flex-col gap-2">
          {candidates.map((candidate) => {
            const accepted = candidate.status === 'accepted';
            const ignored = candidate.status === 'ignored';
            
            let containerClass = "rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed transition-colors";
            if (accepted) containerClass = "rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed transition-colors";
            else if (ignored) containerClass = "rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed opacity-60 transition-colors";
            else if (candidate.status === 'conflict') containerClass = "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed transition-colors";
            else containerClass = "rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed transition-colors";
            
            return (
              <div key={candidate.key} className={containerClass}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-800">{candidate.label}</span>
                    <span className="text-[10px] font-bold text-slate-500">{candidateStatusLabel(candidate.status)}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                     <button
                        type="button"
                        disabled={locked || mismatch || readOnlyEntry || accepted}
                        onClick={() => handleAcceptVoiceCandidate(candidate.key)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#1E3A8A] text-white hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-40"
                        title="采纳"
                      >
                        <CheckOutlined />
                      </button>
                      <button
                        type="button"
                        disabled={locked || mismatch || readOnlyEntry}
                        onClick={() => voiceSession.ignoreDocumentCandidate(candidate.key)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="忽略"
                      >
                        <CloseOutlined />
                      </button>
                  </div>
                </div>
                <div className="mt-1 text-slate-700 font-medium">{candidate.value}</div>
              </div>
            );
          })}
        </div>
      );
    }
    return nodes;
  }, [
    voiceSession.candidates.documentFields,
    voiceSession.ignoreDocumentCandidate,
    fieldsByKey,
    handleAcceptVoiceCandidate,
    locked,
    mismatch,
    readOnlyEntry
  ]);

  // ==================== 提交流程（对齐出院记录） ====================
  const doSubmit = async () => {
    const missingRequired = bodySections.filter((section) => section.required && !section.text.trim());
    if (missingRequired.length) {
      message.error(`请先完善必填字段：${missingRequired.map((section) => section.title).join('、')}`);
      return;
    }

    const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
    values.admissionDiagnoses = acceptedDiagnoses;
    await submit({
      fields: submitSnapshot.fields,
      fieldLabels: submitSnapshot.fieldLabels,
      fieldOrder: submitSnapshot.fieldOrder,
      content: finalContent,
      changeSummary: submitSnapshot.changeSummary,
      draftValues: values,
      draftStep: 1,
    });
  };

  const handleSubmit = () => {
    if (locked || submitting) return;
    if (runtimeRegenerating || regeneratingSectionKey) {
      message.warning('字段正在重新生成，请完成后再提交。');
      return;
    }
    if (runtimeValuesLoading) {
      message.warning('字段内容正在加载，请稍后。');
      return;
    }
    if (runtimeLoading || runtimeError || !sections.length) {
      message.error('入院记录模板或字段取值未就绪，暂不能提交。');
      return;
    }
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
          <p>
            患者 <b>{patient.name}</b> 的<b>{templateTitle}</b>将提交。
          </p>
          <p className="mt-1.5 text-amber-600">正文已由医生核对，提交后生成历史版本。</p>
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

  // ==================== UI 辅助 ====================
  const renderActionButton = (children: ReactNode, onClick: () => void, title?: string, disabled = false) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1 text-[11px] font-semibold border rounded-md px-2 py-1 transition-colors',
        disabled
          ? 'cursor-not-allowed border-slate-200 text-slate-300'
          : 'text-slate-500 hover:text-[#1E3A8A] border-slate-200 hover:border-[#1E3A8A]',
      ].join(' ')}
    >
      {children}
    </button>
  );

  const regenerationDisabled = runtimeRegenerating
    || Boolean(regeneratingSectionKey)
    || locked
    || mismatch
    || runtimeLoading
    || runtimeValuesLoading
    || Boolean(runtimeError);

  return (
    <ParadigmShell
      doc={doc}
      showParadigmBadge={false}
      showPatientId={false}
      actions={!readOnlyEntry ? renderActionButton(
        <><HistoryOutlined />历史{versionCount ? `(${versionCount})` : ''}</>,
        openHistory,
        '历史版本与修改记录',
      ) : null}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前入院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />
          {runtimeValuesLoading && (
            <div className="sticky top-0 z-20 border-b border-blue-100 bg-blue-50/95 px-4 py-2 text-xs font-semibold text-blue-700 backdrop-blur">
              <span className="inline-flex items-center gap-2">
                <ReloadOutlined className="animate-spin" />
                正在加载字段内容，请稍后
              </span>
            </div>
          )}

          {runtimeLoading || runtimeError ? (
            <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#F8FAFC]">
              <ReloadOutlined className={`text-[#1E3A8A] text-2xl ${runtimeLoading ? 'animate-spin' : ''}`} />
              <h3 className="text-sm font-bold text-slate-800 mt-3">
                {runtimeLoading ? '正在加载入院记录配置' : '入院记录配置不可用'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {runtimeLoading ? '正在读取模板配置和已有字段内容。' : runtimeError}
              </p>
              {!runtimeLoading && (
                <button
                  onClick={() => {
                    clearAdmissionRuntimeCache(doc.code, patient.admissionNo);
                    setReloadToken((value) => value + 1);
                  }}
                  className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white"
                >
                  重新加载
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-h-full flex-col">
              <div className="flex-1 pb-40">
                <DocumentChatWorkspace
                  docName={templateTitle}
                  patient={patient}
                  sections={bodySections}
                  metaRows={metaRows}
                  sectionBadgeLabel="病历段落"
                  sectionBottomNodes={sectionBottomNodes}
                  actions={(
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {renderActionButton(
                        <><ReloadOutlined className={runtimeRegenerating ? 'animate-spin' : undefined} />重新生成全部</>,
                        () => void regenerateAllSections(),
                        '重新请求后台字段生成并覆盖当前正文',
                        regenerationDisabled,
                      )}
                    </div>
                  )}
                  locked={locked}
                  sectionEdits={editedSectionMap}
                  resetKeys={sectionResetKeys}
                  regeneratingSectionKey={regeneratingSectionKey}
                  onChange={updateSection}
                  onReset={resetSection}
                  onRegenerateSection={(sectionKey) => void regenerateSection(sectionKey)}
                  onFocusSection={handleFocusSection}
                  optimizeSection={rewriteSectionText}
                  onRewriteStatusChange={updateRewriteStatus}
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
            disabled={runtimeLoading || runtimeValuesLoading || Boolean(runtimeError) || !sections.length || runtimeRegenerating || Boolean(regeneratingSectionKey) || mismatch || patientMode === 'new'}
            busy={submitting}
            busyText={submitText}
            progress={submitProgress}
            onUnlock={() => {
              setLocked(false);
              message.info('已解除锁定，可重新编辑后再次提交。');
            }}
          />
        )}

        <VersionHistoryDrawer
          open={historyOpen}
          onClose={closeHistory}
          docCode={doc.code}
          patientId={patient.admissionNo}
          versionAdapter={backendRuntimeVersionAdapter}
        />
      </div>
    </ParadigmShell>
  );
}
