import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  ExpandAltOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import DocumentPaper, { type DocumentPaperMetaCell } from '../../components/clinical/DocumentPaper';
import EditableDocumentPaper from '../../components/clinical/EditableDocumentPaper';
import EvidencePanel from '../../components/clinical/EvidencePanel';
import WritebackBar from '../../components/clinical/WritebackBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import type { SectionRewriteStatus } from '../../components/clinical/SectionEditor';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
import { saveDraft, loadDraft } from '../../services/draftService';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import {
  applyDischargeFieldAutomation,
  isDischargeMetaSection,
  loadDischargeRuntime,
  type DischargeRuntimeState,
} from '../../services/dischargeRuntime';
import { buildSubmitSnapshot } from '../../services/documentFlow';
import { backendRuntimeVersionAdapter } from '../../services/versionService';
import type { ClinicalSection, FieldValue, IcdItem, PatientBrief } from '../../services/types';
import type {
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceItemDto,
  RuntimeEvidenceSourceStatusDto,
  RuntimeRewriteType,
} from '../../services/pluginRuntimeTypes';

type PreviewMode = 'read' | 'edit';

function toRuntimeRewriteType(mode: string): RuntimeRewriteType {
  if (mode === 'polish' || mode === 'academic' || mode === 'expand' || mode === 'shorten') return mode;
  return 'custom';
}

function appendSectionMaterial(currentText: string, insertText: string): string {
  const current = currentText.trimEnd();
  const addition = insertText.trim();
  if (!addition) return currentText;
  if (!current) return addition;
  return `${current}\n${addition}`;
}

function evidenceDedupeKey(item: RuntimeEvidenceItemDto): string {
  return item.evidenceId?.trim()
    || [item.sourceSystem, item.evidenceType, item.occurredAt, item.title, item.summary].join('|');
}

function mergeSourceStatuses(
  bundles: RuntimeEvidenceBundleDto[],
  evidenceItems: RuntimeEvidenceItemDto[],
): RuntimeEvidenceSourceStatusDto[] {
  const evidenceCountBySource = new Map<string, number>();
  evidenceItems.forEach((item) => {
    evidenceCountBySource.set(item.sourceSystem, (evidenceCountBySource.get(item.sourceSystem) ?? 0) + 1);
  });

  const statusBySource = new Map<string, RuntimeEvidenceSourceStatusDto>();
  bundles.flatMap((bundle) => bundle.sourceStatuses ?? []).forEach((status) => {
    const previous = statusBySource.get(status.sourceSystem);
    if (!previous || (status.status === 'success' && previous.status !== 'success')) {
      statusBySource.set(status.sourceSystem, status);
    }
  });

  evidenceCountBySource.forEach((count, sourceSystem) => {
    const previous = statusBySource.get(sourceSystem);
    statusBySource.set(sourceSystem, {
      sourceSystem,
      status: previous?.status ?? 'success',
      hit: count > 0,
      evidenceCount: count,
      simulated: previous?.simulated,
      pulledAt: previous?.pulledAt,
      responseTimeMs: previous?.responseTimeMs,
      message: previous?.message,
    });
  });

  return [...statusBySource.values()];
}

function mergeEvidenceBundles(
  bundles: RuntimeEvidenceBundleDto[],
  fallback: Pick<RuntimeEvidenceBundleDto, 'patientId' | 'visitId' | 'documentType' | 'docCode'>,
): RuntimeEvidenceBundleDto {
  const evidenceByKey = new Map<string, RuntimeEvidenceItemDto>();
  bundles.flatMap((bundle) => bundle.evidenceItems ?? []).forEach((item) => {
    const key = evidenceDedupeKey(item);
    if (key && !evidenceByKey.has(key)) {
      evidenceByKey.set(key, item);
    }
  });

  const evidenceItems = [...evidenceByKey.values()].sort((left, right) => {
    const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
    const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
    return rightTime - leftTime;
  });
  const warnings = [...new Set(bundles.flatMap((bundle) => bundle.warnings ?? []))];
  const first = bundles[0];

  return {
    patientId: first?.patientId ?? fallback.patientId,
    visitId: first?.visitId ?? fallback.visitId,
    documentType: first?.documentType ?? fallback.documentType,
    docCode: first?.docCode ?? fallback.docCode,
    fieldKey: 'all',
    evidenceItems,
    sourceStatuses: mergeSourceStatuses(bundles, evidenceItems),
    warnings,
    resolvedAt: first?.resolvedAt,
  };
}

const MAX_META_CELLS_PER_ROW = 3;

function normalizeDateInputValue(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function buildCurrentMetaRows(
  patient: PatientBrief,
  sections: ClinicalSection[],
  metaFieldKeys: string[],
  editable: boolean,
  onChange: (sectionKey: string, text: string) => void,
): DocumentPaperMetaCell[][] {
  const rows: DocumentPaperMetaCell[][] = [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位号', value: patient.bed },
      { label: '住院号', value: patient.admissionNo },
      { label: '入院诊断', value: patient.diagnosis ?? '待完善' },
    ],
  ];
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const configuredCells = metaFieldKeys
    .map((key) => sectionByKey.get(key))
    .filter((section): section is ClinicalSection => Boolean(section))
    .map((section) => ({
      label: section.title,
      value: renderMetaCell(section, editable, onChange),
    }));

  for (let index = 0; index < configuredCells.length; index += MAX_META_CELLS_PER_ROW) {
    rows.push(configuredCells.slice(index, index + MAX_META_CELLS_PER_ROW));
  }
  return rows;
}

function renderMetaCell(
  section: ClinicalSection,
  editable: boolean,
  onChange: (sectionKey: string, text: string) => void,
): ReactNode {
  if (!editable || section.inputType !== 'date' || !section.editable) {
    return section.text || '待完善';
  }
  return (
    <input
      type="date"
      value={normalizeDateInputValue(section.text)}
      onChange={(event) => onChange(section.key, event.target.value)}
      className="w-full min-w-[8.5rem] rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-[#1E3A8A] focus:ring-1 focus:ring-[#93C5FD]"
    />
  );
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
  const [runtimeState, setRuntimeState] = useState<DischargeRuntimeState | null>(null);
  const [sections, setSections] = useState<ClinicalSection[]>([]);
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState<IcdItem[]>([]);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('read');
  const [sectionResetKeys, setSectionResetKeys] = useState<Record<string, number>>({});
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [evidenceBundle, setEvidenceBundle] = useState<RuntimeEvidenceBundleDto | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
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
    patientId: patient.id,
    editor: '林志远 主治医师',
    versionAdapter: backendRuntimeVersionAdapter,
  });

  const resetEvidenceWorkspace = useCallback(() => {
    setActiveSectionKey(null);
    setEvidenceBundle(null);
    setEvidenceError(null);
    setEvidenceLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    resetEvidenceWorkspace();
    setRuntimeLoading(true);
    setRuntimeError('');
    setRuntimeState(null);
    setSections([]);
    setSectionResetKeys({});
    setAcceptedDiagnoses([]);

    loadDischargeRuntime(doc.code, patient.id, patientBrief)
      .then((runtime) => {
        if (cancelled) return;
        const saved = loadDraft(doc.code, patient.id);
        const restoredSections = saved
          ? runtime.sections.map((section) => ({
              ...section,
              text: (saved.values[section.key] as string)
                ?? (saved.values[section.title] as string)
                ?? section.text,
            }))
          : runtime.sections;

        setRuntimeState(runtime);
        setSections(applyDischargeFieldAutomation(restoredSections));
        setAcceptedDiagnoses(
          saved ? (saved.values.dischargeDiagnoses as IcdItem[] | undefined) ?? runtime.icdCandidates : runtime.icdCandidates,
        );
        setLocked(saved?.status === 'submitted');
        hydratedRef.current = true;
      })
      .catch((error) => {
        if (cancelled) return;
        const messageText = error instanceof Error ? error.message : '出院记录模板或字段取值加载失败';
        setRuntimeError(messageText);
        setLocked(false);
      })
      .finally(() => {
        if (!cancelled) setRuntimeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc.code, patient.id, patientBrief, reloadToken, resetEvidenceWorkspace, setLocked]);

  const updateSection = useCallback((sectionKey: string, text: string) => {
    setSections((prev) => applyDischargeFieldAutomation(
      prev.map((section) => (section.key === sectionKey ? { ...section, text } : section)),
    ));
  }, []);

  const bumpSectionResetKey = useCallback((sectionKey: string) => {
    setSectionResetKeys((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] ?? 0) + 1,
    }));
  }, []);

  const metaRows = useMemo(
    () => buildCurrentMetaRows(
      patientBrief,
      sections,
      runtimeState?.metaFieldKeys ?? [],
      previewMode === 'edit' && !locked,
      updateSection,
    ),
    [locked, patientBrief, previewMode, runtimeState?.metaFieldKeys, sections, updateSection],
  );

  const bodySections = useMemo<ClinicalSection[]>(
    () => sections.filter((section) => !isDischargeMetaSection(section, runtimeState?.metaFieldKeys ?? [])),
    [runtimeState?.metaFieldKeys, sections],
  );

  const materialSections = useMemo<ClinicalSection[]>(
    () => bodySections.filter((section) => section.evidenceEnabled),
    [bodySections],
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
        sections,
        changeSummary: '医生确认提交出院记录',
        includeEmptySections: true,
      }),
    [sections],
  );

  const finalContent = submitSnapshot.content;

  useEffect(() => {
    if (!hydratedRef.current || locked) return;
    const t = window.setTimeout(() => {
      const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
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

  const resetSection = (sectionKey: string) => {
    const base = runtimeState?.sections.find((section) => section.key === sectionKey);
    if (!base) return;
    updateSection(sectionKey, base.text);
    bumpSectionResetKey(sectionKey);
    if (sectionKey === 'dischargeDiagnosis') setAcceptedDiagnoses(runtimeState?.icdCandidates ?? []);
  };

  const rewriteSectionText = async (section: ClinicalSection, text: string, mode: string) => {
    const result = await pluginRuntimeApi.rewriteText({
      docCode: doc.code,
      patientIdHis: patient.id,
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

  const loadEvidenceForFields = useCallback(async (fieldKeys: string[]) => {
    if (!fieldKeys.length) {
      setEvidenceBundle(mergeEvidenceBundles([], {
        patientId: patient.id,
        visitId: patient.id,
        documentType: templateTitle,
        docCode: doc.code,
      }));
      setEvidenceError(null);
      setEvidenceLoading(false);
      return;
    }

    setEvidenceLoading(true);
    setEvidenceError(null);
    setEvidenceBundle(null);

    const results = await Promise.allSettled(fieldKeys.map((fieldKey) => pluginRuntimeApi.getEvidence({
        patientId: patient.id,
        visitId: patient.id,
        documentType: templateTitle,
        docCode: doc.code,
        fieldKey,
      })));
    const bundles = results
      .filter((result): result is PromiseFulfilledResult<RuntimeEvidenceBundleDto> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failedCount = results.length - bundles.length;

    setEvidenceBundle(mergeEvidenceBundles(bundles, {
      patientId: patient.id,
      visitId: patient.id,
      documentType: templateTitle,
      docCode: doc.code,
    }));
    setEvidenceError(failedCount > 0 ? `部分资料加载失败：${failedCount} 个字段未返回。` : null);
    setEvidenceLoading(false);
  }, [doc.code, patient.id, templateTitle]);

  const materialFieldKeys = useMemo(
    () => materialSections.map((section) => section.key).join('|'),
    [materialSections],
  );

  useEffect(() => {
    if (previewMode !== 'edit' || runtimeLoading || runtimeError) return;
    void loadEvidenceForFields(materialFieldKeys ? materialFieldKeys.split('|') : []);
  }, [loadEvidenceForFields, materialFieldKeys, previewMode, runtimeError, runtimeLoading]);

  const resolveInsertTargetSectionKey = useCallback((): string | null => {
    if (activeSectionKey && bodySections.some((section) => section.key === activeSectionKey && section.editable)) {
      return activeSectionKey;
    }
    return bodySections.find((section) => section.editable)?.key ?? null;
  }, [activeSectionKey, bodySections]);

  const insertEvidenceIntoTarget = useCallback((insertText: string) => {
    if (mismatch) {
      message.error('防串户锁定中，禁止插入资料。请先在病历系统中切回当前患者。');
      return;
    }
    if (locked) {
      message.warning('当前文书已锁定，不能插入资料。');
      return;
    }
    if (!insertText.trim()) {
      message.warning('资料内容为空，未插入。');
      return;
    }
    const targetSectionKey = resolveInsertTargetSectionKey();
    if (!targetSectionKey) {
      message.warning('请先点一下要插入的正文段落。');
      return;
    }
    const currentText = sections.find((section) => section.key === targetSectionKey)?.text ?? '';
    updateSection(targetSectionKey, appendSectionMaterial(currentText, insertText));
    bumpSectionResetKey(targetSectionKey);
    setActiveSectionKey(targetSectionKey);
    message.success('已插入资料，可继续编辑。');
  }, [
    bumpSectionResetKey,
    locked,
    mismatch,
    resolveInsertTargetSectionKey,
    sections,
    updateSection,
  ]);

  const doSubmit = async () => {
    const missingRequired = sections.filter((section) => section.required && !section.text.trim());
    if (missingRequired.length) {
      message.error(`请先完善必填字段：${missingRequired.map((section) => section.title).join('、')}`);
      return;
    }

    const values: Record<string, FieldValue> = Object.fromEntries(sections.map((section) => [section.key, section.text]));
    values.dischargeDiagnoses = acceptedDiagnoses;
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
    if (runtimeLoading || runtimeError || !sections.length) {
      message.error('出院记录模板或字段取值未就绪，暂不能提交。');
      return;
    }
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
        openHistory,
        '历史版本与修改记录',
      )}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          <MeltdownAlert visible={mismatch} text={`宿主病历系统活动患者已切换，与当前出院记录患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。`} />

          {runtimeLoading || runtimeError ? (
            <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#F8FAFC]">
              <ReloadOutlined className={`text-[#1E3A8A] text-2xl ${runtimeLoading ? 'animate-spin' : ''}`} />
              <h3 className="text-sm font-bold text-slate-800 mt-3">
                {runtimeLoading ? '正在加载出院记录模板' : '出院记录配置不可用'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {runtimeLoading ? '正在从后台读取模板字段和模拟 HIS/EMR/ICD 取值。' : runtimeError}
              </p>
              {!runtimeLoading && (
                <button
                  onClick={() => setReloadToken((value) => value + 1)}
                  className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white"
                >
                  重新加载
                </button>
              )}
            </div>
          ) : previewMode === 'read' ? (
            <DocumentPaper
              docName={templateTitle}
              patient={patientBrief}
              sections={bodySections}
              metaRows={metaRows}
              actions={renderActionButton(
                <><ReloadOutlined />编辑</>,
                () => setPreviewMode('edit'),
                '编辑出院记录',
              )}
            />
          ) : (
            <div className="min-h-full">
              <div className="p-4 pb-36">
                <div className="mx-auto max-w-[980px]">
                  <EditableDocumentPaper
                    docName={templateTitle}
                    patient={patientBrief}
                    sections={bodySections}
                    metaRows={metaRows}
                    actions={renderActionButton(
                      <><ExpandAltOutlined />通读全文</>,
                      () => {
                        resetEvidenceWorkspace();
                        setPreviewMode('read');
                      },
                    )}
                    locked={locked}
                    sectionEdits={editedSectionMap}
                    resetKeys={sectionResetKeys}
                    onChange={updateSection}
                    onReset={resetSection}
                    onFocusSection={setActiveSectionKey}
                    optimize={() => {
                      throw new Error('后台 AI 重写未配置');
                    }}
                    optimizeSection={rewriteSectionText}
                    onRewriteStatusChange={updateRewriteStatus}
                  />
                </div>
              </div>
              <div className="sticky bottom-0 z-30">
                <EvidencePanel
                  bundle={evidenceBundle}
                  loading={evidenceLoading}
                  error={evidenceError}
                  title="临床资料"
                  variant="tray"
                  onInsertEvidence={(_item, insertText) => insertEvidenceIntoTarget(insertText)}
                />
              </div>
            </div>
          )}
        </div>

        <WritebackBar
          label="提交出院记录"
          onWriteback={handleSubmit}
          locked={locked}
          disabled={runtimeLoading || Boolean(runtimeError) || !sections.length}
          busy={submitting}
          busyText={submitText}
          progress={submitProgress}
          onUnlock={() => {
            setLocked(false);
            message.info('已解除锁定，可重新编辑后再次提交。');
          }}
        />

        <VersionHistoryDrawer
          open={historyOpen}
          onClose={closeHistory}
          docCode={doc.code}
          patientId={patient.id}
          versionAdapter={backendRuntimeVersionAdapter}
        />
      </div>
    </ParadigmShell>
  );
}
