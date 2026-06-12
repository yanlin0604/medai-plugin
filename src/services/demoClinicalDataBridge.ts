import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './windowMode';
import type {
  RuntimeDocValueBundleDto,
  RuntimeFieldValueDto,
  RuntimePulledSourceDto,
} from './pluginRuntimeTypes';

const DEMO_BS_SOURCE = 'demo-bs';
const DEMO_DISCHARGE_DOC_CODE = 'DOC010';
const DEMO_DATA_MAX_AGE_MS = 10 * 60 * 1000;

export interface DemoClinicalDataContext {
  source: string;
  patientId: string;
  patientName: string;
  docCode: string;
  data: DemoClinicalData;
  updatedAt: string;
  receivedAt: string;
}

interface DemoClinicalData {
  version?: string;
  patientId?: string;
  patientName?: string;
  updatedAt?: string;
  his?: {
    admissionDate?: string;
    dischargeDate?: string;
    hospitalDays?: string;
    diagnosisEvidence?: string;
    orderSummary?: string;
    dischargeMedication?: string;
  };
  lis?: {
    summary?: string;
  };
  pacs?: {
    summary?: string;
  };
}

export async function getLatestDemoClinicalData(
  patientIdHis: string,
  docCode: string,
): Promise<DemoClinicalDataContext | null> {
  if (!isTauriRuntime()) return null;

  try {
    const context = await invoke<DemoClinicalDataContext | null>('get_latest_demo_clinical_data');
    if (!isValidDemoClinicalContext(context, patientIdHis, docCode)) {
      return null;
    }
    return context;
  } catch {
    return null;
  }
}

export function mergeDemoClinicalValues(
  values: RuntimeDocValueBundleDto,
  context: DemoClinicalDataContext | null,
): RuntimeDocValueBundleDto {
  if (!context) return values;

  const data = context.data;
  const nextValues: Record<string, RuntimeFieldValueDto> = { ...(values.values ?? {}) };
  const updateTime = context.updatedAt || context.receivedAt || new Date().toISOString();

  setTextValue(nextValues, 'admissionDate', data.his?.admissionDate, 'his', updateTime);
  setTextValue(nextValues, 'dischargeDate', data.his?.dischargeDate, 'his', updateTime);
  setTextValue(nextValues, 'hospitalDays', data.his?.hospitalDays, 'his', updateTime);

  return {
    ...values,
    values: nextValues,
    pulledSources: mergePulledSources(values.pulledSources ?? [], {
      adapterKey: 'demo-bs-local',
      sourceType: 'demo',
      simulated: true,
      hit: true,
      pulledAt: updateTime,
    }),
    resolvedAt: updateTime,
  };
}

function isValidDemoClinicalContext(
  context: DemoClinicalDataContext | null,
  patientIdHis: string,
  docCode: string,
) {
  if (!context || context.source !== DEMO_BS_SOURCE) return false;
  if (context.patientId !== patientIdHis) return false;
  if (context.docCode.toUpperCase() !== docCode.toUpperCase()) return false;
  if (context.docCode.toUpperCase() !== DEMO_DISCHARGE_DOC_CODE) return false;

  const timestamp = Date.parse(context.receivedAt || context.updatedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= DEMO_DATA_MAX_AGE_MS;
}

function setTextValue(
  values: Record<string, RuntimeFieldValueDto>,
  fieldKey: string,
  value: string | undefined,
  sourceType: string,
  updateTime: string,
) {
  if (!value?.trim()) return;
  values[fieldKey] = {
    ...values[fieldKey],
    fieldKey,
    value,
    sourceType,
    sourcePath: 'demo-bs-local',
    simulated: true,
    updateTime,
    warnings: mergeWarnings(values[fieldKey], '已使用BS demo本地模拟数据'),
  };
}

function mergeWarnings(value: RuntimeFieldValueDto | undefined, warning: string) {
  return Array.from(new Set([...(value?.warnings ?? []), warning]));
}

function mergePulledSources(sources: RuntimePulledSourceDto[], source: RuntimePulledSourceDto) {
  return [
    ...sources.filter((item) => item.adapterKey !== source.adapterKey),
    source,
  ];
}
