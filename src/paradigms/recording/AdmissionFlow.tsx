import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { message, Modal } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentChatWorkspace from '../../components/clinical/DocumentChatWorkspace';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import AdmissionVoiceTray from '../../components/admissionVoice/AdmissionVoiceTray';
import { useHotkey } from '../../hooks/useHotkey';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
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
import {
  getLatestFieldAssistContext,
  isUsableFieldAssistContext,
} from '../../services/fieldAssist/contextBridge';
import type { FieldAssistContext } from '../../services/fieldAssist/types';
import { getFieldAssistSnapshotKey } from '../../services/fieldAssist/types';
import { applyFieldDraft } from '../../services/fieldAssist/writeback';
import { buildSuggestionDraft } from '../../services/fieldAssist/generation';
import { UploadOutlined, Loading3QuartersOutlined } from '@ant-design/icons';

const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const FIELD_EXTRACTION_WS_URL = String(import.meta.env.VITE_FIELD_EXTRACTION_WS_URL ?? '').trim();
const ADMISSION_DOCUMENT_FIELD_SET = new Set<string>(ADMISSION_DOCUMENT_FIELD_KEYS);

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
  const [applyingSectionKey, setApplyingSectionKey] = useState<string | null>(null);
  const [fieldContext, setFieldContext] = useState<FieldAssistContext | null>(null);
  const latestFieldSnapshotKeyRef = useRef('');
  const hydratedRef = useRef(false);
  const templateSectionTextsRef = useRef<Record<string, string>>({});

  const {
    locked,
    setLocked,
    mismatch,
    submitting,
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

  // ==================== 字段上下文轮询 ====================
  useEffect(() => {
    let disposed = false;
    const pollFieldContext = async () => {
      const nextContext = await getLatestFieldAssistContext();
      if (disposed) return;

      const usableContext = isUsableFieldAssistContext(nextContext) ? nextContext : null;
      if (!usableContext || usableContext.docCode !== doc.code || usableContext.patientId !== patient.admissionNo) {
        if (latestFieldSnapshotKeyRef.current) {
          latestFieldSnapshotKeyRef.current = '';
          setFieldContext(null);
        }
        return;
      }

      const nextSnapshotKey = getFieldAssistSnapshotKey(usableContext);
      if (nextSnapshotKey === latestFieldSnapshotKeyRef.current) return;

      latestFieldSnapshotKeyRef.current = nextSnapshotKey;
      setFieldContext(usableContext);
    };

    void pollFieldContext();
    const timer = window.setInterval(() => {
      void pollFieldContext();
    }, 1800);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [doc.code, patient.admissionNo]);

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
  const metaCells = useMemo(
    () => [
      { label: '婚姻', value: currentPatient ? '已婚' : tempPatientInfo.maritalStatus ?? '未录入' },
      { label: '职业', value: currentPatient ? '职员' : tempPatientInfo.occupation ?? '未录入' },
      { label: '出生地', value: currentPatient ? '广东' : tempPatientInfo.birthPlace ?? '未录入' },
      { label: '入院日期', value: admissionDate },
      { label: '入院科室', value: deptName },
      { label: '记录医师', value: doctor },
    ],
    [
      admissionDate,
      currentPatient,
      deptName,
      doctor,
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

  // ==================== 段落操作 ====================
  const handleApplyField = async (sectionKey: string) => {
    if (applyingSectionKey) return;
    const currentSection = sections.find((s) => s.key === sectionKey);
    if (!currentSection) return;

    if (!fieldContext || fieldContext.fieldKey !== sectionKey) {
      message.warning(`请先在 CS 端聚焦「${currentSection.title}」字段，再执行回填。`);
      return;
    }

    setApplyingSectionKey(sectionKey);
    try {
      const effectiveDraft = buildSuggestionDraft(fieldContext, currentSection.text, '当前字段文本回填');
      await applyFieldDraft({
        context: fieldContext,
        response: effectiveDraft.response,
        finalText: currentSection.text,
        mode: 'fill',
        doctorName: `${doctor} 医师`,
      });
      message.success(`已回填${currentSection.title}`);
    } catch (applyError) {
      message.error(applyError instanceof Error ? applyError.message : '字段回填失败');
    } finally {
      setApplyingSectionKey(null);
    }
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

  useEffect(() => {
    const protectedKeys = new Set(protectedVoiceFieldKeys);
    const candidates = voiceSession.safeDocumentCandidates.filter((candidate) => !protectedKeys.has(candidate.key));
    if (candidates.length > 0) {
      candidates.forEach(applyDocumentVoiceCandidate);
      voiceSession.markDocumentsAccepted(candidates.map((candidate) => candidate.key));
    }
  }, [
    voiceSession.safeDocumentCandidates,
    protectedVoiceFieldKeys,
    applyDocumentVoiceCandidate,
    voiceSession,
  ]);

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

  const sectionToolbarActions = useMemo(() => {
    const actions: Record<string, ReactNode> = {};
    bodySections.forEach((section) => {
      const isApplying = applyingSectionKey === section.key;
      const canWriteback = fieldContext?.fieldKey === section.key;
      actions[section.key] = (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleApplyField(section.key);
          }}
          disabled={isApplying || locked}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          title={canWriteback ? '回填到 CS 当前字段' : '点击查看回填条件'}
        >
          {isApplying ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
          回填
        </button>
      );
    });
    return actions;
  }, [bodySections, applyingSectionKey, fieldContext, locked, handleApplyField]);

  // ==================== UI 辅助 ====================

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
    >
      <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC]">
        <section className="border-b border-slate-200 bg-white px-4 py-1.5 shrink-0">
          <div className="mx-auto flex max-w-[980px] items-center gap-x-3 overflow-hidden whitespace-nowrap text-[11px] leading-5 text-slate-500">
            <span className="shrink-0 font-semibold text-slate-700">{patient.name}</span>
            <span className="shrink-0">{patient.gender} {patient.age}</span>
            <span className="shrink-0">住院号 {patient.admissionNo}</span>
            {patient.bed ? <span className="shrink-0">{patient.bed}床</span> : null}
            {metaCells.map((item) => (
              <span key={item.label} className="shrink-0">{item.label} {item.value}</span>
            ))}
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white px-4 py-2 shrink-0">
          <div className="mx-auto flex max-w-[980px] items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-slate-800">整篇病历</div>
              <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                生成全部正文段落后，可一次性回填到病历系统。
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void regenerateAllSections()}
                disabled={regenerationDisabled}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {runtimeRegenerating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                生成整篇
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={runtimeLoading || runtimeValuesLoading || Boolean(runtimeError) || !sections.length || runtimeRegenerating || Boolean(regeneratingSectionKey) || mismatch || patientMode === 'new' || locked}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#1E3A8A] px-3 text-[12px] font-bold text-white hover:bg-[#172554] disabled:opacity-50"
              >
                {submitting ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                一键回填
              </button>
            </div>
          </div>
        </section>

        <div className="flex-1 min-h-0 overflow-y-auto">
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
                  sectionBadgeLabel="病历段落"
                  hideHeader={true}
                  hideBadges={true}
                  sectionBottomNodes={sectionBottomNodes}
                  sectionToolbarActions={sectionToolbarActions}
                  locked={locked}
                  sectionEdits={editedSectionMap}
                  resetKeys={sectionResetKeys}
                  regeneratingSectionKey={regeneratingSectionKey}
                  onChange={updateSection}
                  onRegenerateSection={(sectionKey) => void regenerateSection(sectionKey)}
                  onFocusSection={handleFocusSection}
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
                  tempPatientInfo={tempPatientInfo}
                  asrError={voiceSession.asrError}
                  analysisError={voiceSession.analysisError}
                  analysisConnected={voiceSession.analysisConnected}
                  onStart={voiceSession.start}
                  onStop={() => voiceSession.stop(true)}
                  onClearTranscripts={voiceSession.clearTranscripts}
                  onAcceptPatient={handleAcceptPatientCandidate}
                  onIgnorePatient={voiceSession.ignorePatientCandidate}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ParadigmShell>
  );
}
