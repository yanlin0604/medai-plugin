import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioOutlined,
  CloseOutlined,
  FileTextOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import ParadigmShell from '../../paradigms/ParadigmShell';
import type { DocDefinition } from '../../config/docRegistry';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import type {
  RuntimeFieldCompositionItemDto,
  RuntimeFieldCompositionTemplateDto,
} from '../../services/pluginRuntimeTypes';
import type { DocFieldDef, DocTemplate, FieldValue } from '../../services/types';
import type { FieldAssistContext, FieldAssistDraft } from '../../services/fieldAssist/types';
import { buildSuggestionDraft, generateFieldDraft } from '../../services/fieldAssist/generation';
import { applyFieldDraft, insertTextIntoFieldContext } from '../../services/fieldAssist/writeback';
import { submitDocument } from '../../services/emsBridge';
import { loadDraft, saveDraft } from '../../services/draftService';
import { stripCitations } from '../../services/documentFlow';
import { localVersionAdapter } from '../../services/versionService';
import { useFieldAssistStore } from '../../stores/useFieldAssistStore';
import type { Patient } from '../../stores/usePatientStore';
import { getLatestFieldAssistContext, isUsableFieldAssistContext } from '../../services/fieldAssist/contextBridge';
import { getFieldAssistSnapshotKey } from '../../services/fieldAssist/types';
import { renderTextWithCitations } from '../../components/fieldAssist/FieldAssistPanel';
import RoundSegmentSelector from '../../components/RoundSegmentSelector';

interface Props {
  doc: DocDefinition;
  patient: Patient;
}

interface FieldSession {
  field: DocFieldDef;
  value: string;
  draft?: FieldAssistDraft;
  compositionTemplate?: RuntimeFieldCompositionTemplateDto;
  compositionValues?: Record<string, string>;
  compositionDrafts?: Record<string, FieldAssistDraft>;
  compositionGenerating?: Record<string, boolean>;
  generating: boolean;
  applying: boolean;
}

interface AsrServerMessage {
  text?: string;
  is_final?: boolean;
}

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const EMPTY_SESSION_META = {
  source: 'assistant-workbench',
  selectedText: '',
  prefix: '',
  selectionStart: 0,
  selectionEnd: 0,
  trigger: 'focus',
  sessionId: 'full-document',
  writebackUrl: '',
  detectedAt: '',
  receivedAt: '',
} as const;
const FIELD_CONTEXT_POLL_MS = 1800;
const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const ASR_MODE = '2';
const DOC003_ROUND_FIELD_KEYS = ['subjective', 'objective', 'assessment', 'plan'];

function buildAsrWsUrl(baseUrl: string, mode: string) {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}mode=${encodeURIComponent(mode)}`;
}

function valueToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object' && 'name' in item) {
          const name = String((item as { name?: unknown }).name ?? '');
          const code = String((item as { code?: unknown }).code ?? '');
          return code ? `${name} ${code}` : name;
        }
        return String(item);
      })
      .filter(Boolean)
      .join('；');
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return valueToText((value as { value?: unknown }).value);
  }
  return value == null ? '' : String(value);
}

function buildInitialSessions(template: DocTemplate, values: Record<string, unknown>): FieldSession[] {
  return template.fields.map((field) => ({
    field,
    value: valueToText(values[field.key] ?? field.default ?? field.staticText ?? ''),
    generating: false,
    applying: false,
  }));
}

function sortedCompositionItems(
  template: RuntimeFieldCompositionTemplateDto,
): RuntimeFieldCompositionItemDto[] {
  return [...(template.items ?? [])].sort((left, right) => (left.itemOrder ?? 0) - (right.itemOrder ?? 0));
}

function normalizeCompositionLabel(value: string): string {
  return valueToText(value).replace(/\s+/g, '');
}

function createDefaultCompositionValues(
  template: RuntimeFieldCompositionTemplateDto,
): Record<string, string> {
  return sortedCompositionItems(template).reduce<Record<string, string>>((result, item) => {
    result[item.itemKey] = item.defaultText || '';
    return result;
  }, {});
}

function parseCompositionFieldValue(
  template: RuntimeFieldCompositionTemplateDto,
  value?: string,
): Record<string, string> {
  const values = createDefaultCompositionValues(template);
  const text = valueToText(value);
  if (!text) return values;

  const items = sortedCompositionItems(template);
  const itemByLabel = new Map(items.map((item) => [normalizeCompositionLabel(item.itemLabel), item]));
  const lines = text.split(/\r?\n/);
  const hasLabelLine = lines.some((line) => {
    const match = /^(?:\d+[.、]\s*)?([^：:]+)[：:]\s*(.*)$/.exec(line.trim());
    return Boolean(match && itemByLabel.has(normalizeCompositionLabel(match[1])));
  });

  if (!hasLabelLine) {
    const positionalValues = { ...values };
    lines.forEach((line, index) => {
      const item = items[index] ?? items[items.length - 1];
      if (!item) return;
      const textLine = line.trim();
      positionalValues[item.itemKey] = index < items.length
        ? textLine
        : [positionalValues[item.itemKey], textLine].filter(Boolean).join('；');
    });
    return positionalValues;
  }

  let activeItemKey = '';
  const unmatchedLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const match = /^(?:\d+[.、]\s*)?([^：:]+)[：:]\s*(.*)$/.exec(trimmed);
    const item = match ? itemByLabel.get(normalizeCompositionLabel(match[1])) : undefined;
    if (item) {
      activeItemKey = item.itemKey;
      values[item.itemKey] = match?.[2]?.trim() || '';
      return;
    }

    if (activeItemKey) {
      values[activeItemKey] = [values[activeItemKey], trimmed].filter(Boolean).join('\n');
    } else {
      unmatchedLines.push(trimmed);
    }
  });

  if (unmatchedLines.length > 0 && items[0]) {
    values[items[0].itemKey] = [values[items[0].itemKey], ...unmatchedLines].filter(Boolean).join('\n');
  }

  return values;
}

function normalizeCompositionItemOutput(value: unknown): string {
  return valueToText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('；');
}

function formatCompositionFieldValue(
  template: RuntimeFieldCompositionTemplateDto,
  values: Record<string, string>,
): string {
  return sortedCompositionItems(template)
    .map((item) => normalizeCompositionItemOutput(values[item.itemKey]))
    .join('\n');
}

function getSessionDisplayValue(session: FieldSession): string {
  if (!session.compositionTemplate) return session.value;
  return formatCompositionFieldValue(
    session.compositionTemplate,
    session.compositionValues ?? createDefaultCompositionValues(session.compositionTemplate),
  );
}

function attachCompositionTemplate(
  session: FieldSession,
  compositionTemplate: RuntimeFieldCompositionTemplateDto,
): FieldSession {
  const compositionValues = parseCompositionFieldValue(compositionTemplate, session.value);
  return {
    ...session,
    compositionTemplate,
    compositionValues,
    value: formatCompositionFieldValue(compositionTemplate, compositionValues),
  };
}

function updateCompositionItemInSession(
  session: FieldSession,
  itemKey: string,
  nextText: string,
  draft?: FieldAssistDraft,
): FieldSession {
  if (!session.compositionTemplate) return session;
  const nextValues = {
    ...createDefaultCompositionValues(session.compositionTemplate),
    ...(session.compositionValues ?? {}),
    [itemKey]: nextText,
  };
  const nextDrafts = draft
    ? { ...(session.compositionDrafts ?? {}), [itemKey]: draft }
    : session.compositionDrafts;

  return {
    ...session,
    value: formatCompositionFieldValue(session.compositionTemplate, nextValues),
    compositionValues: nextValues,
    compositionDrafts: nextDrafts,
  };
}

function applyRuntimeValueToSession(session: FieldSession, value: unknown): FieldSession {
  const nextValue = valueToText(value);
  if (!session.compositionTemplate) {
    return {
      ...session,
      value: nextValue,
    };
  }

  const compositionValues = parseCompositionFieldValue(session.compositionTemplate, nextValue);
  return {
    ...session,
    compositionValues,
    value: formatCompositionFieldValue(session.compositionTemplate, compositionValues),
  };
}

function isAiCompositionItem(item: RuntimeFieldCompositionItemDto): boolean {
  return String(item.sourceType).toLowerCase() === 'ai';
}

function getCompositionSourceLabel(item: RuntimeFieldCompositionItemDto): string {
  switch (String(item.sourceType).toLowerCase()) {
    case 'ai':
      return 'AI';
    case 'fixed':
      return '固定';
    case 'manual':
      return '手填';
    default:
      return item.sourceType || '配置';
  }
}

function getLatestCompositionDraft(session: FieldSession): FieldAssistDraft | undefined {
  return Object.values(session.compositionDrafts ?? {}).reduce<FieldAssistDraft | undefined>((latest, draft) => {
    if (!draft) return latest;
    if (!latest || Date.parse(draft.createdAt) > Date.parse(latest.createdAt)) return draft;
    return latest;
  }, undefined);
}

function resolveInitialValues(docCode: string, patientId: string) {
  if (docCode === 'DOC003') {
    return Promise.resolve({
      docCode,
      patientIdHis: patientId,
      values: {},
      icdCandidates: [],
      pulledSources: [],
      resolvedAt: new Date().toISOString(),
    });
  }

  return pluginRuntimeApi.resolveRuntimeValues(docCode, patientId, true);
}

async function loadFieldCompositionTemplates(
  template: DocTemplate,
  docCode: string,
  params: {
    doctorCode?: string;
    doctorName?: string;
    deptCode?: string;
    clientId?: string;
  },
): Promise<Map<string, RuntimeFieldCompositionTemplateDto>> {
  const entries = await Promise.all(template.fields.map(async (field) => {
    try {
      const composition = await pluginRuntimeApi.getFieldComposition(docCode, field.key, params);
      const compositionTemplate = composition.templates?.[0];
      if (!compositionTemplate || !compositionTemplate.items?.length) return null;
      return [field.key, compositionTemplate] as const;
    } catch {
      return null;
    }
  }));

  return new Map(entries.filter((entry): entry is readonly [string, RuntimeFieldCompositionTemplateDto] => Boolean(entry)));
}

function attachCompositionTemplates(
  sessions: FieldSession[],
  templatesByFieldKey: Map<string, RuntimeFieldCompositionTemplateDto>,
): FieldSession[] {
  if (!templatesByFieldKey.size) return sessions;
  return sessions.map((session) => {
    const compositionTemplate = templatesByFieldKey.get(session.field.key);
    return compositionTemplate ? attachCompositionTemplate(session, compositionTemplate) : session;
  });
}

function readSavedFieldValue(values: Record<string, FieldValue>, field: DocFieldDef): string | undefined {
  const value = values[field.key] ?? values[field.label] ?? values[field.section];
  const text = valueToText(value);
  return text || undefined;
}

function parseDraftContentSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const pattern = /【([^】]+)】([\s\S]*?)(?=【[^】]+】|$)/g;
  let match = pattern.exec(content);
  while (match) {
    const title = match[1]?.trim();
    const text = match[2]?.trim();
    if (title && text) sections[title] = text;
    match = pattern.exec(content);
  }
  return sections;
}

function mergeSavedDraftIntoSessions(
  sessions: FieldSession[],
  values: Record<string, FieldValue> | undefined,
  content?: string,
): FieldSession[] {
  if (!values && !content) return sessions;
  const contentSections = content ? parseDraftContentSections(content) : {};

  return sessions.map((session) => {
    const savedValue = values ? readSavedFieldValue(values, session.field) : undefined;
    const contentValue = contentSections[session.field.label] ?? contentSections[session.field.section];
    const nextValue = savedValue ?? contentValue;
    if (!nextValue) return session;
    return {
      ...session,
      value: nextValue,
    };
  });
}

function mergeLatestDraftsIntoSessions(
  sessions: FieldSession[],
  drafts: FieldAssistDraft[],
  patientId: string,
  docCode: string,
): FieldSession[] {
  const latestByField = new Map<string, FieldAssistDraft>();
  const latestByCompositionItem = new Map<string, FieldAssistDraft>();

  drafts.forEach((draft) => {
    const response = draft.response;
    if (response.patientId !== patientId || response.docCode !== docCode || !response.fieldKey) return;

    if (response.compositionItemKey) {
      const key = `${response.fieldKey}:${response.compositionItemKey}`;
      const current = latestByCompositionItem.get(key);
      if (!current || Date.parse(draft.createdAt) > Date.parse(current.createdAt)) {
        latestByCompositionItem.set(key, draft);
      }
      return;
    }

    const current = latestByField.get(response.fieldKey);
    if (!current || Date.parse(draft.createdAt) > Date.parse(current.createdAt)) {
      latestByField.set(response.fieldKey, draft);
    }
  });

  if (!latestByField.size && !latestByCompositionItem.size) return sessions;

  return sessions.map((session) => {
    let nextSession = session;
    const parentDraft = latestByField.get(session.field.key);
    if (parentDraft) {
      const nextText = parentDraft.generatedText || parentDraft.response.generatedText || nextSession.value;
      nextSession = nextSession.compositionTemplate
        ? {
          ...nextSession,
          draft: parentDraft,
          compositionValues: parseCompositionFieldValue(nextSession.compositionTemplate, nextText),
        }
        : {
          ...nextSession,
          draft: parentDraft,
          value: nextText,
        };

      if (nextSession.compositionTemplate) {
        nextSession = {
          ...nextSession,
          value: formatCompositionFieldValue(
            nextSession.compositionTemplate,
            nextSession.compositionValues ?? createDefaultCompositionValues(nextSession.compositionTemplate),
          ),
        };
      }
    }

    if (nextSession.compositionTemplate) {
      sortedCompositionItems(nextSession.compositionTemplate).forEach((item) => {
        const itemDraft = latestByCompositionItem.get(`${session.field.key}:${item.itemKey}`);
        if (!itemDraft) return;
        if (parentDraft && Date.parse(itemDraft.createdAt) < Date.parse(parentDraft.createdAt)) return;
        nextSession = updateCompositionItemInSession(
          nextSession,
          item.itemKey,
          itemDraft.generatedText || itemDraft.response.generatedText || '',
          itemDraft,
        );
      });
    }

    return nextSession;
  });
}

function buildContext(
  doc: DocDefinition,
  patient: Patient,
  session: FieldSession,
  instruction?: string,
): FieldAssistContext {
  return {
    ...EMPTY_SESSION_META,
    patientId: patient.id,
    patientName: patient.name,
    docCode: doc.code,
    docName: doc.name,
    fieldKey: session.field.key,
    fieldLabel: session.field.label,
    fieldValue: getSessionDisplayValue(session),
    doctorCode: patient.doctor,
    doctorName: patient.doctor,
    deptCode: patient.deptName,
    clientId: 'medai-plugin',
    detectedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    sessionId: `full-document:${doc.code}:${patient.id}:${session.field.key}`,
    trigger: instruction ? 'input' : 'focus',
  };
}

function buildCompositionItemContext(
  doc: DocDefinition,
  patient: Patient,
  session: FieldSession,
  item: RuntimeFieldCompositionItemDto,
  instruction?: string,
): FieldAssistContext {
  return {
    ...EMPTY_SESSION_META,
    patientId: patient.id,
    patientName: patient.name,
    docCode: doc.code,
    docName: doc.name,
    fieldKey: session.field.key,
    fieldLabel: `${session.field.label}-${item.itemLabel}`,
    parentFieldKey: session.field.key,
    compositionItemKey: item.itemKey,
    compositionItemLabel: item.itemLabel,
    fieldValue: session.compositionValues?.[item.itemKey] ?? '',
    doctorCode: patient.doctor,
    doctorName: patient.doctor,
    deptCode: patient.deptName,
    clientId: 'medai-plugin',
    detectedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    sessionId: `full-document:${doc.code}:${patient.id}:${session.field.key}:${item.itemKey}`,
    trigger: instruction ? 'input' : 'focus',
  };
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STANDARD_META_FIELD_KEYS = new Set(['admissionDate', 'dischargeDate', 'hospitalDays']);
const STANDARD_META_FIELD_LABELS = new Set(['入院日期', '出院日期', '住院天数']);
const TOP_META_SLOTS = new Set(['patient', 'date']);
const WHOLE_WRITEBACK_SUMMARY = '全文字段工作台一键回填';
const WHOLE_REQUIRED_FIELD_KEYS = new Set([
  'admissionCondition',
  'admissionDiagnosis',
  'treatmentCourse',
  'dischargeDiagnosis',
  'dischargeCondition',
  'dischargeOrders',
]);
const WHOLE_REQUIRED_FIELD_LABELS = new Set([
  '入院情况',
  '入院诊断',
  '诊疗经过',
  '出院诊断',
  '出院情况',
  '出院医嘱',
]);

function isTopWorkbenchField(field: DocFieldDef): boolean {
  if (field.metaSlot && TOP_META_SLOTS.has(field.metaSlot)) return true;
  return STANDARD_META_FIELD_KEYS.has(field.key)
    || STANDARD_META_FIELD_LABELS.has(field.label)
    || STANDARD_META_FIELD_LABELS.has(field.section);
}

function compactTopMetaItems(topSessions: FieldSession[]) {
  const patientLabels = new Set(['姓名', '性别', '年龄', '住院号']);
  const seen = new Set(patientLabels);
  return topSessions
    .map((session) => ({ label: session.field.label, value: getSessionDisplayValue(session) || '待同步' }))
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    });
}

function buildWholeDocumentSnapshot(sessions: FieldSession[]) {
  const effectiveSessions = sessions.map((session) => ({
    ...session,
    value: stripCitations(getSessionDisplayValue(session).trim()),
  }));
  const writableSessions = effectiveSessions.filter((session) => session.value);

  return {
    fields: Object.fromEntries(writableSessions.map((session) => [session.field.key, session.value])),
    fieldLabels: Object.fromEntries(writableSessions.map((session) => [session.field.key, session.field.label])),
    fieldOrder: writableSessions.map((session) => session.field.key),
    content: writableSessions
      .map((session) => `【${session.field.label}】${session.value}`)
      .join('\n'),
    draftValues: Object.fromEntries(writableSessions.map((session) => [session.field.key, session.value])) as Record<string, FieldValue>,
  };
}

function getMissingWholeRequiredFields(sessions: FieldSession[]): string[] {
  return sessions.flatMap((session) => {
    if (session.compositionTemplate) {
      const values = session.compositionValues ?? createDefaultCompositionValues(session.compositionTemplate);
      const missingItems = sortedCompositionItems(session.compositionTemplate)
        .filter((item) => item.required && !stripCitations(valueToText(values[item.itemKey])).trim())
        .map((item) => `${session.field.label}-${item.itemLabel}`);
      if (missingItems.length) return missingItems;

      const hasAnyValue = Object.values(values).some((value) => stripCitations(valueToText(value)).trim());
      if ((
        session.field.required
        || WHOLE_REQUIRED_FIELD_KEYS.has(session.field.key)
        || WHOLE_REQUIRED_FIELD_LABELS.has(session.field.label)
        || WHOLE_REQUIRED_FIELD_LABELS.has(session.field.section)
      ) && !hasAnyValue) {
        return [session.field.label];
      }
      return [];
    }

    return ((
      session.field.required
      || WHOLE_REQUIRED_FIELD_KEYS.has(session.field.key)
      || WHOLE_REQUIRED_FIELD_LABELS.has(session.field.label)
      || WHOLE_REQUIRED_FIELD_LABELS.has(session.field.section)
    ) && !getSessionDisplayValue(session).trim())
      ? [session.field.label]
      : [];
  });
}

export default function UnifiedDocWorkspace({ doc, patient }: Props) {
  const addDraft = useFieldAssistStore((state) => state.addDraft);
  const drafts = useFieldAssistStore((state) => state.drafts);
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [sessions, setSessions] = useState<FieldSession[]>([]);
  const [fieldContext, setFieldContext] = useState<FieldAssistContext | null>(null);
  const [activeFieldKey, setActiveFieldKey] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [wholeGenerating, setWholeGenerating] = useState(false);
  const [wholeWriting, setWholeWriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [segmentSelectorOpen, setSegmentSelectorOpen] = useState(false);
  const [assignedSegments, setAssignedSegments] = useState<any[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unassignedSegments, setUnassignedSegments] = useState<any[]>([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [refreshingSegments, setRefreshingSegments] = useState(false);

  const latestFieldSnapshotKeyRef = useRef('');
  const asrWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceFieldKeyRef = useRef('');
  const finalVoiceDraftRef = useRef('');
  const voiceBaseContextRef = useRef<FieldAssistContext | null>(null);
  const fieldCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const topSessions = useMemo(
    () => sessions.filter((session) => isTopWorkbenchField(session.field)),
    [sessions],
  );
  const bodySessions = useMemo(
    () => sessions.filter((session) => !isTopWorkbenchField(session.field)),
    [sessions],
  );
  const activeSession = useMemo(
    () => bodySessions.find((session) => session.field.key === activeFieldKey) ?? bodySessions[0] ?? null,
    [activeFieldKey, bodySessions],
  );
  const topMetaItems = useMemo(
    () => compactTopMetaItems(topSessions),
    [topSessions],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const loadWorkspace = async () => {
      try {
        const [nextTemplate, values] = await Promise.all([
          pluginRuntimeApi.getRuntimeDocTemplate(doc.code),
          resolveInitialValues(doc.code, patient.id),
        ]);
        const compositionTemplates = await loadFieldCompositionTemplates(nextTemplate, doc.code, {
          doctorCode: patient.doctor,
          doctorName: patient.doctor,
          deptCode: patient.deptName,
          clientId: 'medai-plugin',
        });
        if (cancelled) return;

        setTemplate(nextTemplate);
        const saved = loadDraft(doc.code, patient.id);
        const nextSessions = mergeLatestDraftsIntoSessions(
          attachCompositionTemplates(
            mergeSavedDraftIntoSessions(
              buildInitialSessions(nextTemplate, values.values ?? {}),
              saved?.values,
              saved?.content,
            ),
            compositionTemplates,
          ),
          useFieldAssistStore.getState().drafts,
          patient.id,
          doc.code,
        );
        setSessions(nextSessions);
        setActiveFieldKey(nextSessions.find((session) => !isTopWorkbenchField(session.field))?.field.key ?? '');
        setVoiceText('');
        setVoicePanelOpen(false);
        setRecording(false);
        setLoading(false);

        if (doc.code === 'DOC003') {
          pluginRuntimeApi.getRoundPendingStatus(patient.id, patient.doctor)
            .then((res) => {
              if (cancelled) return;
              setAssignedSegments(res.assignedSegments ?? []);
              setUnassignedCount(res.unassignedCount);
              setUnassignedSegments(res.unassignedSegments);
              setBannerVisible(res.unassignedCount > 0);

            })
            .catch((err) => {
              console.error('获取查房状态失败:', err);
            });
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '文书字段加载失败');
        setLoading(false);
      }
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [doc.code, patient.deptName, patient.doctor, patient.id]);

  const handleRefreshRoundSegments = async () => {
    if (doc.code !== 'DOC003' || refreshingSegments) return;
    setRefreshingSegments(true);
    try {
      const res = await pluginRuntimeApi.getRoundPendingStatus(patient.id, patient.doctor);
      setAssignedSegments(res.assignedSegments ?? []);
      setUnassignedCount(res.unassignedCount);
      setUnassignedSegments(res.unassignedSegments);
      setBannerVisible(res.unassignedCount > 0);
      message.success('已刷新最新查房记录');
    } catch (err) {
      console.error('刷新查房状态失败:', err);
      message.error('刷新查房记录失败');
    } finally {
      setRefreshingSegments(false);
    }
  };

  useEffect(() => {
    setSessions((current) => mergeLatestDraftsIntoSessions(current, drafts, patient.id, doc.code));
  }, [doc.code, drafts, patient.id]);

  useEffect(() => {
    if (!bodySessions.length) {
      if (activeFieldKey) setActiveFieldKey('');
      return;
    }
    if (!bodySessions.some((session) => session.field.key === activeFieldKey)) {
      setActiveFieldKey(bodySessions[0].field.key);
    }
  }, [activeFieldKey, bodySessions]);

  useEffect(() => {
    let disposed = false;

    const pollFieldContext = async () => {
      const nextContext = await getLatestFieldAssistContext();
      if (disposed) return;

      const usableContext = isUsableFieldAssistContext(nextContext) ? nextContext : null;
      if (!usableContext || usableContext.docCode !== doc.code || usableContext.patientId !== patient.id) {
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
      if (bodySessions.some((session) => session.field.key === usableContext.fieldKey)) {
        stopAsrRecording();
        voiceFieldKeyRef.current = '';
        finalVoiceDraftRef.current = '';
        setVoiceText('');
        setVoicePanelOpen(false);
        setActiveFieldKey(usableContext.fieldKey);
        scrollToField(usableContext.fieldKey);
      }
    };

    void pollFieldContext();
    const timer = window.setInterval(() => {
      void pollFieldContext();
    }, FIELD_CONTEXT_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [bodySessions, doc.code, patient.id]);

  const updateSession = (fieldKey: string, updater: (session: FieldSession) => FieldSession) => {
    setSessions((current) => current.map((session) => (
      session.field.key === fieldKey ? updater(session) : session
    )));
  };

  const updateCompositionItemValue = (fieldKey: string, itemKey: string, nextText: string) => {
    updateSession(fieldKey, (session) => updateCompositionItemInSession(session, itemKey, nextText));
  };

  const handleGenerateCompositionItem = async (
    fieldKey: string,
    itemKey: string,
    instruction?: string,
    transcriptText?: string,
  ) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    const compositionTemplate = session?.compositionTemplate;
    const compositionItem = compositionTemplate
      ? sortedCompositionItems(compositionTemplate).find((item) => item.itemKey === itemKey)
      : undefined;

    if (!session || !compositionTemplate || !compositionItem) return;
    if (!isAiCompositionItem(compositionItem)) {
      message.info(`${compositionItem.itemLabel}为${getCompositionSourceLabel(compositionItem)}项，请直接编辑。`);
      return;
    }
    if (session.compositionGenerating?.[itemKey]) return;

    updateSession(fieldKey, (item) => ({
      ...item,
      compositionGenerating: {
        ...(item.compositionGenerating ?? {}),
        [itemKey]: true,
      },
    }));

    try {
      const draft = await generateFieldDraft(
        buildCompositionItemContext(doc, patient, session, compositionItem, instruction),
        instruction,
        transcriptText,
      );
      addDraft(draft);
      updateSession(fieldKey, (item) => updateCompositionItemInSession(
        item,
        itemKey,
        draft.generatedText || draft.response.generatedText,
        draft,
      ));
      message.success(`已生成${session.field.label}-${compositionItem.itemLabel}`);
    } catch (generateError) {
      message.error(generateError instanceof Error ? generateError.message : '字段生成失败');
    } finally {
      updateSession(fieldKey, (item) => ({
        ...item,
        compositionGenerating: {
          ...(item.compositionGenerating ?? {}),
          [itemKey]: false,
        },
      }));
    }
  };

  const handleGenerate = async (fieldKey: string, instruction?: string, transcriptText?: string) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    if (!session || session.generating) return;
    if (session.compositionTemplate) {
      message.info(`「${session.field.label}」已拆成子项，请在具体子项上生成。`);
      return;
    }
    const activeContext = fieldContext?.fieldKey === fieldKey ? fieldContext : null;

    updateSession(fieldKey, (item) => ({ ...item, generating: true }));
    try {
      const draft = await generateFieldDraft(activeContext ?? buildContext(doc, patient, session, instruction), instruction, transcriptText);
      addDraft(draft);
      updateSession(fieldKey, (item) => ({
        ...item,
        draft,
        value: draft.generatedText || draft.response.generatedText,
      }));
      if (fieldKey === activeFieldKey) {
        stopAsrRecording();
        voiceFieldKeyRef.current = '';
        finalVoiceDraftRef.current = '';
        setVoiceText('');
        setVoicePanelOpen(false);
      }
      message.success(`已生成${session.field.label}`);
    } catch (generateError) {
      message.error(generateError instanceof Error ? generateError.message : '字段生成失败');
    } finally {
      updateSession(fieldKey, (item) => ({ ...item, generating: false }));
    }
  };

  const generateRoundDrivenFields = async (
    segmentText: string,
    currentSessions: FieldSession[],
    overwriteExisting: boolean,
  ): Promise<number> => {
    const targetSessions = currentSessions.filter((session) =>
      DOC003_ROUND_FIELD_KEYS.includes(session.field.key) && (overwriteExisting || !session.value.trim()),
    );

    if (targetSessions.length === 0) return 0;

    setSessions((prev) => prev.map((session) => (
      targetSessions.some((target) => target.field.key === session.field.key)
        ? { ...session, generating: true }
        : session
    )));

    const results = await Promise.all(targetSessions.map(async (session) => {
      try {
        const baseContext = buildContext(doc, patient, session, `根据查房记录生成${session.field.label}`);
        const draft = await generateFieldDraft(
          overwriteExisting ? { ...baseContext, fieldValue: '' } : baseContext,
          `根据查房记录生成${session.field.label}`,
          segmentText,
        );
        addDraft(draft);

        setSessions((current) => current.map((item) => {
          if (item.field.key === session.field.key) {
            return {
              ...item,
              draft,
              value: draft.generatedText || draft.response.generatedText,
              generating: false,
            };
          }
          return item;
        }));
        return true;
      } catch (err) {
        console.error(`查房片段生成字段 ${session.field.key} 失败:`, err);
        setSessions((current) => current.map((item) => (
          item.field.key === session.field.key ? { ...item, generating: false } : item
        )));
        return false;
      }
    }));

    return results.filter(Boolean).length;
  };

  const handleGenerateWholeDocument = async () => {
    const targets = bodySessions.filter((session) => !session.generating);
    if (!targets.length || wholeGenerating || wholeWriting) return;

    setWholeGenerating(true);
    message.loading({ content: `正在生成${doc.name}全文`, key: 'whole-document' });
    try {
      const generatedValues = await pluginRuntimeApi.resolveRuntimeValues(doc.code, patient.id, false, {
        doctorCode: patient.doctor,
        doctorName: patient.doctor,
        deptCode: patient.deptName,
        clientId: 'medai-plugin',
      });
      setSessions((current) => current.map((session) => {
        const nextValue = generatedValues.values?.[session.field.key];
        if (nextValue === undefined) return session;
        return applyRuntimeValueToSession(session, nextValue);
      }));
      const generatedSessions = bodySessions.map((session) => {
        const nextValue = generatedValues.values?.[session.field.key];
        return nextValue === undefined ? session : applyRuntimeValueToSession(session, nextValue);
      });
      const missingFields = getMissingWholeRequiredFields(generatedSessions);
      if (missingFields.length) {
        message.warning({
          content: `全文生成未完成，缺少：${missingFields.join('、')}`,
          key: 'whole-document',
          duration: 3,
        });
        return;
      }
      message.success({ content: `${doc.name}全文已生成`, key: 'whole-document', duration: 1.5 });
    } catch (generateError) {
      message.error({
        content: generateError instanceof Error ? generateError.message : '全文生成失败',
        key: 'whole-document',
      });
    } finally {
      setWholeGenerating(false);
    }
  };

  const handleWritebackWholeDocument = async () => {
    if (wholeGenerating || wholeWriting) return;
    const snapshot = buildWholeDocumentSnapshot(sessions);
    // if (!snapshot.content.trim()) {
    //   message.warning('请先生成或填写病历内容，再执行一键回填。');
    //   return;
    // }
    // const missingFields = getMissingWholeRequiredFields(bodySessions);
    // if (missingFields.length) {
    //   message.warning(`请先生成或填写：${missingFields.join('、')}，再执行一键回填。`);
    //   return;
    // }

    setWholeWriting(true);
    message.loading({ content: `正在回填${doc.name}全文`, key: 'whole-writeback' });
    try {
      const result = await submitDocument({
        docCode: doc.code,
        docName: doc.name,
        patientId: patient.id,
        fields: snapshot.fields,
        fieldLabels: snapshot.fieldLabels,
        fieldOrder: snapshot.fieldOrder,
        content: snapshot.content,
      });
      if (!result.ok) {
        message.error({ content: result.message, key: 'whole-writeback' });
        return;
      }

      const timestamp = new Date().toISOString();
      saveDraft({
        docCode: doc.code,
        patientId: patient.id,
        values: snapshot.draftValues,
        content: snapshot.content,
        step: 1,
        status: 'submitted',
        updatedAt: timestamp,
      });
      await localVersionAdapter.createVersion({
        docCode: doc.code,
        patientId: patient.id,
        content: snapshot.content,
        fields: snapshot.fields,
        fieldLabels: snapshot.fieldLabels,
        fieldOrder: snapshot.fieldOrder,
        editor: patient.doctor,
        timestamp,
        changeSummary: WHOLE_WRITEBACK_SUMMARY,
      });
      message.success({ content: result.message, key: 'whole-writeback', duration: 2 });
    } catch (writebackError) {
      message.error({
        content: writebackError instanceof Error ? writebackError.message : '全文回填失败',
        key: 'whole-writeback',
      });
    } finally {
      setWholeWriting(false);
    }
  };

  const handleVoiceSend = () => {
    if (!activeSession) {
      message.warning('请先选择一个正文编辑字段。');
      return;
    }
    if (activeSession.compositionTemplate) {
      message.warning(`「${activeSession.field.label}」已拆成子项，请在具体子项上生成。`);
      return;
    }
    if (!voiceText.trim()) {
      message.warning('请先确认语音转写文本。');
      return;
    }
    void handleGenerate(activeSession.field.key, `根据语音转写生成${activeSession.field.label}`, voiceText.trim());
  };

  const writeVoiceTranscript = (fieldKey: string, transcriptDraft: string) => {
    const baseContext = voiceBaseContextRef.current;
    const nextText = baseContext
      ? insertTextIntoFieldContext(baseContext, transcriptDraft).text
      : transcriptDraft;
    setVoiceText(nextText);
    updateSession(fieldKey, (item) => ({
      ...item,
      value: nextText,
    }));
  };

  const handleAsrMessage = (data: AsrServerMessage) => {
    const fieldKey = voiceFieldKeyRef.current;
    if (!fieldKey) return;

    if (!data.text && data.is_final) {
      writeVoiceTranscript(fieldKey, finalVoiceDraftRef.current);
      return;
    }
    if (!data.text) return;

    const nextDraft = `${finalVoiceDraftRef.current}${data.text}`;
    writeVoiceTranscript(fieldKey, nextDraft);

    if (data.is_final !== false) {
      finalVoiceDraftRef.current = nextDraft;
    }
  };

  const stopAsrRecording = (sendFlush = true) => {
    const processor = audioProcessorRef.current;
    audioProcessorRef.current = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }

    const source = audioSourceRef.current;
    audioSourceRef.current = null;
    source?.disconnect();

    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }

    const ws = asrWsRef.current;
    asrWsRef.current = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN) {
        if (sendFlush) ws.send('flush');
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    setRecording(false);
  };

  const closeVoicePanel = () => {
    stopAsrRecording();
    setVoicePanelOpen(false);
    voiceFieldKeyRef.current = '';
    finalVoiceDraftRef.current = '';
    voiceBaseContextRef.current = null;
  };

  const scrollToField = (fieldKey: string) => {
    window.setTimeout(() => {
      fieldCardRefs.current[fieldKey]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    }, 0);
  };

  const handleVoiceTextChange = (nextText: string) => {
    setVoiceText(nextText);
    if (!activeSession) return;
    if (voiceFieldKeyRef.current) {
      finalVoiceDraftRef.current = nextText;
      const editContext = fieldContext?.fieldKey === activeSession.field.key
        ? fieldContext
        : buildContext(doc, patient, activeSession);
      voiceBaseContextRef.current = {
        ...editContext,
        fieldValue: '',
        selectedText: '',
        selectionStart: 0,
        selectionEnd: 0,
      };
    }
    updateSession(activeSession.field.key, (item) => ({
      ...item,
      value: nextText,
    }));
  };

  const handleToggleRecording = async () => {
    if (!activeSession) {
      message.warning('请先选择一个正文编辑字段。');
      return;
    }
    if (activeSession.compositionTemplate) {
      message.warning(`「${activeSession.field.label}」已拆成子项，请在具体子项上编辑。`);
      return;
    }

    if (voicePanelOpen) {
      closeVoicePanel();
      return;
    }

    if (!ASR_WS_URL) {
      message.error('请先在 .env 中配置 VITE_ASR_WS_URL。');
      return;
    }

    const targetFieldKey = activeSession.field.key;
    const activeContext = fieldContext?.fieldKey === targetFieldKey
      ? fieldContext
      : buildContext(doc, patient, activeSession);
    stopAsrRecording(false);
    voiceFieldKeyRef.current = targetFieldKey;
    voiceBaseContextRef.current = activeContext;
    finalVoiceDraftRef.current = '';
    setVoicePanelOpen(true);
    setRecording(true);
    setVoiceText(activeContext.fieldValue);
    message.loading({ content: `正在连接语音识别服务，准备采集「${activeSession.field.label}」语音...`, key: 'doc-workspace-voice' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      if (voiceFieldKeyRef.current !== targetFieldKey) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      const ws = new WebSocket(buildAsrWsUrl(ASR_WS_URL, ASR_MODE));
      asrWsRef.current = ws;

      ws.onopen = () => {
        if (voiceFieldKeyRef.current !== targetFieldKey) {
          ws.close();
          return;
        }

        const AudioContextCtor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
        if (!AudioContextCtor) {
          message.error({ content: '当前浏览器不支持语音采集。', key: 'doc-workspace-voice' });
          closeVoicePanel();
          return;
        }

        const audioContext = new AudioContextCtor({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        audioContextRef.current = audioContext;
        audioSourceRef.current = source;
        audioProcessorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputData = event.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let index = 0; index < inputData.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, inputData[index]));
            pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          ws.send(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        message.success({ content: `正在语音转写「${activeSession.field.label}」`, key: 'doc-workspace-voice', duration: 1.5 });
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          handleAsrMessage(JSON.parse(event.data) as AsrServerMessage);
        } catch {
          // Ignore non-JSON diagnostic frames from the ASR service.
        }
      };

      ws.onerror = () => {
        message.error({ content: '语音识别连接异常，请检查 ASR 服务。', key: 'doc-workspace-voice' });
      };

      ws.onclose = () => {
        if (asrWsRef.current === ws) asrWsRef.current = null;
        setRecording(false);
      };
    } catch (voiceError) {
      stopAsrRecording(false);
      setVoicePanelOpen(false);
      voiceFieldKeyRef.current = '';
      finalVoiceDraftRef.current = '';
      voiceBaseContextRef.current = null;
      message.error({
        content: voiceError instanceof Error ? voiceError.message : '无法获取麦克风权限。',
        key: 'doc-workspace-voice',
      });
    }
  };

  useEffect(() => () => {
    stopAsrRecording(false);
  }, []);

  const handleApply = async (fieldKey: string) => {
    const session = sessions.find((item) => item.field.key === fieldKey);
    if (!session || session.applying) return;
    if (!fieldContext || fieldContext.fieldKey !== fieldKey) {
      message.warning(`请先在 CS 端聚焦「${session.field.label}」字段，再执行回填。`);
      return;
    }
    // if (!session.draft && !session.value.trim()) {
    //   message.warning(`请先生成或填写「${session.field.label}」内容，再执行回填。`);
    //   return;
    // }

    updateSession(fieldKey, (item) => ({ ...item, applying: true }));
    if (session.compositionTemplate) {
      const applyContext: FieldAssistContext = {
        ...buildContext(doc, patient, session, '当前组合字段文本回填'),
        writebackUrl: fieldContext.writebackUrl,
        sessionId: fieldContext.sessionId,
        fieldValue: '',
        selectedText: '',
        prefix: '',
        selectionStart: 0,
        selectionEnd: 0,
      };
      const finalText = getSessionDisplayValue(session);
      const effectiveDraft = session.draft ?? buildSuggestionDraft(applyContext, finalText, '当前组合字段文本回填');
      try {
        await applyFieldDraft({
          context: applyContext,
          response: effectiveDraft.response,
          finalText,
          mode: 'overwrite',
          doctorName: patient.doctor,
        });
        if (!session.draft) {
          addDraft(effectiveDraft);
          updateSession(fieldKey, (item) => ({ ...item, draft: effectiveDraft }));
        }
        message.success(`已回填${session.field.label}`);
      } catch (applyError) {
        message.error(applyError instanceof Error ? applyError.message : '字段回填失败');
      } finally {
        updateSession(fieldKey, (item) => ({ ...item, applying: false }));
      }
      return;
    }

    const applyContext = voiceBaseContextRef.current?.fieldKey === fieldKey
      ? voiceBaseContextRef.current
      : fieldContext;
    const targetCompositionItemKey = applyContext.compositionItemKey && session.compositionTemplate
      ? applyContext.compositionItemKey
      : '';
    const targetText = targetCompositionItemKey
      ? session.compositionValues?.[targetCompositionItemKey] ?? ''
      : getSessionDisplayValue(session);
    const finalText = applyContext === voiceBaseContextRef.current && finalVoiceDraftRef.current.trim()
      ? finalVoiceDraftRef.current.trim()
      : targetText;
    const existingDraft = targetCompositionItemKey
      ? session.compositionDrafts?.[targetCompositionItemKey]
      : session.draft;
    const effectiveDraft = existingDraft ?? buildSuggestionDraft(applyContext, targetText, '当前字段文本回填');
    try {
      await applyFieldDraft({
        context: applyContext,
        response: effectiveDraft.response,
        finalText,
        mode: targetCompositionItemKey
          ? 'overwrite'
          : applyContext === voiceBaseContextRef.current
          ? (applyContext.fieldValue.trim() ? 'replaceSelection' : 'overwrite')
          : undefined,
        doctorName: patient.doctor,
      });
      if (!existingDraft) {
        addDraft(effectiveDraft);
        updateSession(fieldKey, (item) => (
          targetCompositionItemKey
            ? updateCompositionItemInSession(item, targetCompositionItemKey, finalText, effectiveDraft)
            : { ...item, draft: effectiveDraft }
        ));
      }
    } catch (applyError) {
      message.error(applyError instanceof Error ? applyError.message : '字段回填失败');
    } finally {
      updateSession(fieldKey, (item) => ({ ...item, applying: false }));
    }
  };

  if (loading || error || !template) {
    return (
      <ParadigmShell doc={doc} showParadigmBadge={false} showPatientId={false}>
        <div className="flex h-full flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center">
          <FileTextOutlined className="text-2xl text-[#1E3A8A]" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">
            {loading ? '正在加载文书字段' : '文书字段不可用'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {loading ? '正在读取模板和已有字段内容。' : error}
          </p>
        </div>
      </ParadigmShell>
    );
  }

  return (
    <ParadigmShell doc={doc} showParadigmBadge={false} showPatientId={false}>
      <main className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
        <section className="border-b border-slate-200 bg-white px-4 py-1.5">
          <div className="mx-auto flex max-w-[980px] items-center gap-x-3 overflow-hidden whitespace-nowrap text-[11px] leading-5 text-slate-500">
            <span className="shrink-0 font-semibold text-slate-700">{patient.name}</span>
            <span className="shrink-0">{patient.gender} {patient.age}</span>
            <span className="shrink-0">住院号 {patient.id}</span>
            {patient.bedNo ? <span className="shrink-0">{patient.bedNo}</span> : null}
            {topMetaItems.map((item) => (
              <span key={item.label} className="shrink-0">{item.label} {item.value}</span>
            ))}
          </div>
        </section>

        {bannerVisible && unassignedCount > 0 && (
          <section className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="mx-auto flex max-w-[980px] items-center justify-between gap-3 text-amber-800 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🔔</span>
                <span className="font-medium">
                  检测到本次查房有 <strong className="text-amber-950 font-bold">{unassignedCount}</strong> 段语音未匹配到任何患者，可能包含当前患者的信息。
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSegmentSelectorOpen(true)}
                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors"
                >
                  查看并引入
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    for (const seg of unassignedSegments) {
                      try {
                        await pluginRuntimeApi.markRoundStatus(seg.id, 'ignored');
                      } catch (e) {
                        console.error(e);
                      }
                    }
                    setBannerVisible(false);
                    setUnassignedCount(0);
                    message.info('已忽略未匹配的查房片段提示');
                  }}
                  className="px-2.5 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  忽略
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="border-b border-slate-200 bg-white px-4 py-2">
          <div className="mx-auto flex max-w-[980px] items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-slate-800">整篇病历</div>
              <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                生成全部正文段落后，可一次性回填到病历系统。
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {doc.name.includes('病程') && (
                <button
                  type="button"
                  onClick={() => setSegmentSelectorOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                >
                  <AudioOutlined />
                  导入查房记录
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerateWholeDocument}
                disabled={wholeGenerating || wholeWriting || !bodySessions.length}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {wholeGenerating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                生成整篇
              </button>
              <button
                type="button"
                onClick={handleWritebackWholeDocument}
                disabled={wholeGenerating || wholeWriting || !sessions.some((session) => getSessionDisplayValue(session).trim())}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#1E3A8A] px-3 text-[12px] font-bold text-white hover:bg-[#172554] disabled:opacity-50"
              >
                {wholeWriting ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                一键回填
              </button>
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-3">
          <div className="mx-auto flex max-w-[980px] flex-col gap-4">
            {bodySessions.map((session) => {
              const compositionTemplate = session.compositionTemplate;
              const latestCompositionDraft = getLatestCompositionDraft(session);
              const hasDraft = Boolean(session.draft || latestCompositionDraft);
              const canWriteback = Boolean(fieldContext?.fieldKey === session.field.key);
              const generatedAt = formatTime(session.draft?.createdAt ?? latestCompositionDraft?.createdAt);
              const displayValue = getSessionDisplayValue(session);
              const active = activeSession?.field.key === session.field.key;
              return (
                <article
                  key={session.field.key}
                  ref={(element) => {
                    fieldCardRefs.current[session.field.key] = element;
                  }}
                  onClick={() => {
                    if (session.field.key !== activeFieldKey) {
                      closeVoicePanel();
                      setVoiceText('');
                    }
                    setActiveFieldKey(session.field.key);
                  }}
                  className={[
                    'rounded-lg border bg-white shadow-sm transition-colors',
                    active ? 'border-[#1E3A8A] ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800">
                        <span className="truncate">{session.field.label}</span>
                        {compositionTemplate ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">组合</span>
                        ) : null}
                        {active ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#1E3A8A]">当前编辑</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                        {generatedAt ? `最近生成 ${generatedAt}` : ''}
                        {fieldContext?.fieldKey === session.field.key
                          ? fieldContext.compositionItemLabel
                            ? ` HIS当前书写子项：${fieldContext.compositionItemLabel}`
                            : ' HIS当前书写字段'
                          : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {!compositionTemplate && !session.field.disableRegenerate && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveFieldKey(session.field.key);
                            void handleGenerate(session.field.key, `生成${session.field.label}`);
                          }}
                          disabled={session.generating}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {session.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                          {hasDraft ? '重新生成' : '生成'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleApply(session.field.key);
                        }}
                        disabled={session.applying}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        title={canWriteback ? '回填到 CS 当前字段' : '点击查看回填条件'}
                      >
                        {session.applying ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                        {compositionTemplate ? '回填全部' : '回填'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 px-3 py-3">
                    {compositionTemplate ? (
                      <div className="space-y-2">
                        {sortedCompositionItems(compositionTemplate).map((item, index) => {
                          const itemValue = session.compositionValues?.[item.itemKey] ?? '';
                          const itemDraft = session.compositionDrafts?.[item.itemKey];
                          const itemGenerating = Boolean(session.compositionGenerating?.[item.itemKey]);
                          const itemGeneratedAt = formatTime(itemDraft?.createdAt);
                          const itemActive = fieldContext?.fieldKey === session.field.key
                            && fieldContext?.compositionItemKey === item.itemKey;
                          const canGenerateItem = isAiCompositionItem(item) && item.renderRule?.disableRegenerate !== true;
                          return (
                            <div
                              key={item.itemKey}
                              className={[
                                'rounded-md border bg-[#FBFDFF] px-3 py-2',
                                itemActive ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200',
                              ].join(' ')}
                            >
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700">
                                    <span>{index + 1}. {item.itemLabel}</span>
                                    {item.required ? <span className="text-rose-500">*</span> : null}
                                    {itemActive ? (
                                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-[#1E3A8A]">HIS当前子项</span>
                                    ) : null}
                                  </div>
                                  {itemGeneratedAt ? (
                                    <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                                      最近生成 {itemGeneratedAt}
                                    </div>
                                  ) : null}
                                </div>
                                {canGenerateItem ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveFieldKey(session.field.key);
                                      void handleGenerateCompositionItem(
                                        session.field.key,
                                        item.itemKey,
                                        `生成${session.field.label}-${item.itemLabel}`,
                                      );
                                    }}
                                    disabled={itemGenerating}
                                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    {itemGenerating ? <Loading3QuartersOutlined className="animate-spin" /> : <ReloadOutlined />}
                                    {itemDraft ? '重新生成' : '生成'}
                                  </button>
                                ) : null}
                              </div>
                              <textarea
                                value={itemValue}
                                onChange={(event) => updateCompositionItemValue(session.field.key, item.itemKey, event.target.value)}
                                readOnly={item.editable === false}
                                className={[
                                  'min-h-[72px] w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1E3A8A]',
                                  item.editable === false ? 'bg-slate-50 text-slate-500' : 'bg-white',
                                ].join(' ')}
                                placeholder="待填写"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="max-w-[92%] rounded-lg rounded-bl-sm border border-slate-200 bg-[#FBFDFF] px-3 py-2 text-sm leading-6 text-slate-800">
                        {displayValue ? (
                          <div className="whitespace-pre-wrap">
                            {session.draft
                              ? renderTextWithCitations(
                                displayValue || session.draft.generatedText || session.draft.response.generatedText || '',
                                session.draft.response.evidenceSummary,
                              )
                              : displayValue}
                          </div>
                        ) : (
                          <span className="text-slate-400">这个字段还没有内容。</span>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {/* <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-700">
              <CheckCircleOutlined className="mr-1" />
              当前页面按文书字段顺序展示，回填始终是单字段回填，不覆盖整篇。
            </div> */}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <div className="mx-auto max-w-[980px]">
            {voicePanelOpen ? (
              <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[11px] font-bold text-[#1E3A8A]">
                    {recording ? '正在语音转文字' : '语音转文字'}：{activeSession?.field.label ?? '未选择字段'}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {voiceText ? (
                      <button
                        type="button"
                        onClick={() => handleVoiceTextChange('')}
                        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-slate-700"
                      >
                        <CloseOutlined />
                        清空
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (activeSession) void handleApply(activeSession.field.key);
                      }}
                      disabled={!activeSession || !voiceText.trim() || activeSession.applying}
                      className="inline-flex h-6 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      title="回填到当前 HIS 字段"
                    >
                      {activeSession?.applying ? <Loading3QuartersOutlined className="animate-spin" /> : <UploadOutlined />}
                      回填
                    </button>
                    <button
                      type="button"
                      onClick={closeVoicePanel}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] text-slate-400 hover:bg-white hover:text-slate-700"
                      title="收起语音转文字"
                      aria-label="收起语音转文字"
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                </div>
                <textarea
                  value={voiceText}
                  onChange={(event) => handleVoiceTextChange(event.target.value)}
                  className="h-16 w-full resize-none rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1E3A8A]"
                  placeholder={recording ? '正在听写，转写结果稍后显示...' : '语音转文字结果会显示在这里'}
                  disabled={!activeSession}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-[minmax(118px,1fr)_auto_auto] items-center gap-2">
            <div className="min-w-0">
              <select
                value={activeSession?.field.key ?? ''}
                onChange={(event) => {
                  const nextFieldKey = event.target.value;
                  closeVoicePanel();
                  setVoiceText('');
                  setActiveFieldKey(nextFieldKey);
                  scrollToField(nextFieldKey);
                }}
                title="语音写入字段"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1E3A8A]"
              >
                {bodySessions.map((session) => (
                  <option key={session.field.key} value={session.field.key}>{session.field.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleToggleRecording}
              disabled={!activeSession || Boolean(activeSession.compositionTemplate)}
              className={[
                'inline-flex h-11 min-w-[88px] items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold disabled:opacity-50',
                recording
                  ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                  : 'border-[#1E3A8A] bg-[#F0F5FF] text-[#1E3A8A] hover:bg-[#DBEAFE]',
              ].join(' ')}
              title="语音输入"
              aria-label="语音输入"
            >
              <AudioOutlined className={recording ? 'animate-pulse' : undefined} />
              <span className="hidden sm:inline">{voicePanelOpen ? '收起' : '语音'}</span>
            </button>
            <button
              type="button"
              onClick={handleVoiceSend}
              disabled={!activeSession || Boolean(activeSession.compositionTemplate) || !voicePanelOpen || !voiceText.trim() || activeSession.generating}
              className="inline-flex h-11 min-w-[92px] items-center justify-center gap-2 rounded-md bg-[#1E3A8A] px-4 text-sm font-bold text-white hover:bg-[#172554] disabled:opacity-50"
            >
              {activeSession?.generating ? <Loading3QuartersOutlined className="animate-spin" /> : <SendOutlined />}
              <span className="hidden sm:inline">生成</span>
            </button>
            </div>
          </div>
        </section>
      </main>
      <RoundSegmentSelector
        open={segmentSelectorOpen}
        onClose={() => setSegmentSelectorOpen(false)}
        patientId={patient.id}
        patientName={patient.name}
        assignedSegments={assignedSegments}
        unassignedSegments={unassignedSegments}
        onRefresh={handleRefreshRoundSegments}
        refreshing={refreshingSegments}
        onImport={async ({ selectedTexts, assignedIds, unassignedIds }) => {
          if (!selectedTexts.trim()) return;

          try {
            if (unassignedIds.length > 0) {
              await pluginRuntimeApi.claimAndApplyRoundSegments({
                segmentIds: unassignedIds,
                patientIdHis: patient.id,
                patientName: patient.name,
                bedNo: patient.bedNo || undefined,
              });

              setAssignedSegments((prev) => {
                const existing = new Map(prev.map((segment) => [segment.id, segment]));
                unassignedSegments
                  .filter((segment) => unassignedIds.includes(segment.id))
                  .forEach((segment) => {
                    existing.set(segment.id, {
                      ...segment,
                      patientIdHis: patient.id,
                      patientName: patient.name,
                      bedNo: patient.bedNo,
                      isUnassigned: false,
                      status: 'applied',
                    });
                  });
                return Array.from(existing.values()).sort((left, right) => left.id - right.id);
              });

              setUnassignedSegments((prev) => {
                const next = prev.filter((seg) => !unassignedIds.includes(seg.id));
                setUnassignedCount(next.length);
                setBannerVisible(next.length > 0);
                return next;
              });
            }

            const generatedCount = await generateRoundDrivenFields(selectedTexts, sessions, true);
            if (generatedCount === 0) {
              message.warning('当前没有可重新生成的查房记录字段');
              return;
            }

            for (const id of assignedIds) {
              try {
                await pluginRuntimeApi.markRoundStatus(id, 'applied');
              } catch (e) {
                console.error(e);
              }
            }

            setAssignedSegments((prev) => {
              const existing = new Map(prev.map((segment) => [segment.id, segment]));
              prev.forEach((segment) => {
                if (assignedIds.includes(segment.id)) {
                  existing.set(segment.id, { ...segment, status: 'applied', isUnassigned: false });
                }
              });
              return Array.from(existing.values()).sort((left, right) => left.id - right.id);
            });
            message.success('已根据所选查房片段重新生成查房记录字段');
          } catch (err) {
            console.error('导入并提取查房记录失败:', err);
          }
        }}
      />
    </ParadigmShell>
  );
}
