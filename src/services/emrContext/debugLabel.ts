import type { EmrContextDebug } from './types';

const STATUS_LABEL: Record<EmrContextDebug['status'], string> = {
  accepted: '已接收',
  rejected: '已过滤',
  empty: '未收到',
  unavailable: '不可用',
  error: '检测异常',
};

export function formatEmrContextDebugLabel(debug: EmrContextDebug): string {
  const status = STATUS_LABEL[debug.status];
  const docName = debug.context?.docName?.trim() ?? '';

  if (debug.status === 'accepted') {
    return docName ? `${status}：${docName}` : status;
  }

  const detail = [docName, debug.message].filter(Boolean).join(' · ');
  return detail ? `${status}：${detail}` : status;
}
