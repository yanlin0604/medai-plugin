import { invoke } from '@tauri-apps/api/core';
import { getDocByCode } from '../../config/docRegistry';
import { isTauriRuntime } from '../windowMode';
import type { EmrContext, EmrContextDebug } from './types';

export const DEMO_BS_MIN_CONFIDENCE = 0.75;
export const DEMO_BS_CONTEXT_MAX_AGE_MS = 5 * 60 * 1000;

export async function getCurrentEmrContext(): Promise<EmrContext | null> {
  const result = await inspectCurrentEmrContext();
  return result.status === 'accepted' ? result.context : null;
}

export async function inspectCurrentEmrContext(): Promise<EmrContextDebug> {
  const checkedAt = new Date().toISOString();
  if (!isTauriRuntime()) {
    return {
      status: 'unavailable',
      message: '当前不是 Tauri 运行环境，无法读取 HIS 上报。',
      context: null,
      checkedAt,
    };
  }

  try {
    const context = await invoke<EmrContext | null>('get_latest_emr_context');
    const normalizedContext = context
      ? {
        ...context,
        docCode: context.docCode.toUpperCase(),
        signals: context.signals ?? [],
      }
      : null;

    if (!normalizedContext) {
      return {
        status: 'empty',
        message: '尚未收到 HIS 文书上下文上报。',
        context: null,
        checkedAt,
      };
    }

    const rejectionReason = getDemoBsContextRejectionReason(normalizedContext);
    if (rejectionReason) {
      return {
        status: 'rejected',
        message: rejectionReason,
        context: normalizedContext,
        checkedAt,
      };
    }

    return {
      status: 'accepted',
      message: `已接收 ${normalizedContext.docName}`,
      context: normalizedContext,
      checkedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '读取 HIS 上下文失败。',
      context: null,
      checkedAt,
    };
  }
}

export function isValidDemoBsContext(context: EmrContext) {
  return !getDemoBsContextRejectionReason(context);
}

export function getDemoBsContextRejectionReason(context: EmrContext): string {
  // ✅ 同时接受 demo-bs 和 demo-cs
  if (context.source !== 'demo-bs' && context.source !== 'demo-cs') {
    return `不支持的来源 source=${context.source}`;
  }

  if (!getDocByCode(context.docCode.toUpperCase())) {
    return `未注册的文书编码 docCode=${context.docCode}`;
  }

  if (context.confidence < DEMO_BS_MIN_CONFIDENCE) {
    return `可信度过低 confidence=${context.confidence}，需要 >= ${DEMO_BS_MIN_CONFIDENCE}`;
  }

  if (isStaleContext(context)) {
    return 'HIS 上下文已过期，请重新切换文书标签触发上报。';
  }

  if (!context.patientId) return '缺少 patientId';
  if (!context.patientName) return '缺少 patientName';
  if (!context.docName) return '缺少 docName';
  return '';
}

export function isStaleContext(context: Pick<EmrContext, 'receivedAt' | 'detectedAt'>) {
  const timestamp = Date.parse(context.receivedAt || context.detectedAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > DEMO_BS_CONTEXT_MAX_AGE_MS;
}
