import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../windowMode';
import type { EmrContext } from './types';

export const DEMO_BS_DISCHARGE_DOC_CODE = 'DOC010';
export const DEMO_BS_MIN_CONFIDENCE = 0.75;
export const DEMO_BS_CONTEXT_MAX_AGE_MS = 5 * 60 * 1000;

export async function getCurrentEmrContext(): Promise<EmrContext | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const context = await invoke<EmrContext | null>('get_latest_emr_context');
    if (!context || !isValidDemoBsDischargeContext(context)) {
      return null;
    }

    return {
      ...context,
      docCode: context.docCode.toUpperCase(),
      signals: context.signals ?? [],
    };
  } catch {
    return null;
  }
}

export function isValidDemoBsDischargeContext(context: EmrContext) {
  if (context.source !== 'demo-bs') {
    return false;
  }

  if (context.docCode.toUpperCase() !== DEMO_BS_DISCHARGE_DOC_CODE) {
    return false;
  }

  if (context.confidence < DEMO_BS_MIN_CONFIDENCE) {
    return false;
  }

  if (!context.signals.includes('field-marker')) {
    return false;
  }

  if (isStaleContext(context)) {
    return false;
  }

  return Boolean(context.patientId && context.patientName && context.docName);
}

export function isStaleContext(context: Pick<EmrContext, 'receivedAt' | 'detectedAt'>) {
  const timestamp = Date.parse(context.receivedAt || context.detectedAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > DEMO_BS_CONTEXT_MAX_AGE_MS;
}
