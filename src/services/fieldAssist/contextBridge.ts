import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../windowMode';
import type { FieldAssistContext } from './types';
import { getFieldAssistContextKey } from './types';

export const FIELD_ASSIST_CONTEXT_MAX_AGE_MS = 60_000;

export async function getLatestFieldAssistContext(): Promise<FieldAssistContext | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await invoke<FieldAssistContext | null>('get_latest_field_assist_context');
  } catch {
    return null;
  }
}

export async function clearLatestFieldAssistContext() {
  if (!isTauriRuntime()) return;
  try {
    await invoke('clear_latest_field_assist_context');
  } catch {
    // 清理失败不影响气泡状态切换。
  }
}

export function isFieldAssistContextStale(
  context: Pick<FieldAssistContext, 'receivedAt' | 'detectedAt'>,
  now = Date.now(),
) {
  const timestamp = Date.parse(context.receivedAt || context.detectedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > FIELD_ASSIST_CONTEXT_MAX_AGE_MS;
}

export function isUsableFieldAssistContext(
  context: FieldAssistContext | null,
  now = Date.now(),
): context is FieldAssistContext {
  if (!context) return false;
  if (context.source !== 'demo-cs') return false;
  if (typeof context.assistantEnabled !== 'boolean') return false;
  if (!context.patientId || !context.docCode || !context.fieldKey || !context.sessionId) return false;
  if (!context.writebackUrl) return false;
  if (isFieldAssistContextStale(context, now)) return false;
  return true;
}

export function isCurrentFieldAssistContext(
  current: FieldAssistContext | null,
  next: FieldAssistContext | null,
) {
  if (!current || !next) return false;
  return getFieldAssistContextKey(current) === getFieldAssistContextKey(next);
}
