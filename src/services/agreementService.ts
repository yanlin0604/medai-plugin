import axios from 'axios';
import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './windowMode';

export type AgreementType = 'privacy' | 'service';

export interface PublishedAgreement {
  /** 协议标题 */
  title: string;
  /** 协议正文（可能是 HTML 富文本） */
  content: string;
  /** 协议版本号（可选） */
  version?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const AGREEMENT_PATH = '/medical/pluginAgreement/published';

interface TauriRuntimeProxyResponse {
  status: number;
  status_text: string;
  data: unknown;
}

/** 抽取后端统一响应 { code, msg, data } 中的 data */
function unwrapData(payload: unknown): unknown {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return 'data' in body ? body.data : payload;
}

/** 从协议对象/字符串中提取正文 */
function extractAgreementContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const content = record.content
      ?? record.contentHtml
      ?? record.contentText
      ?? record.html
      ?? record.text
      ?? record.body;
    if (typeof content === 'string') return content;
  }
  return '';
}

/** 从协议对象中提取标题 */
function extractAgreementTitle(kind: AgreementType, value: unknown): string {
  const fallback = kind === 'privacy' ? '隐私协议' : '服务协议';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const title = record.title ?? record.name ?? record.agreementName;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return fallback;
}

export function normalizePublishedAgreement(kind: AgreementType, payload: unknown): PublishedAgreement {
  const data = unwrapData(payload);
  const content = extractAgreementContent(data).trim();
  const version = data && typeof data === 'object'
    ? String((data as Record<string, unknown>).version ?? '').trim() || undefined
    : undefined;

  if (!content) {
    throw new Error('协议内容为空，请稍后重试');
  }

  return {
    title: extractAgreementTitle(kind, data),
    content,
    version,
  };
}

async function requestPublishedAgreement(kind: AgreementType): Promise<unknown> {
  const typeParam = encodeURIComponent(kind);
  const url = `${API_BASE_URL}${AGREEMENT_PATH}?type=${typeParam}`;

  if (!isTauriRuntime()) {
    const response = await axios.get(url, {
      headers: { 'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456' },
    });
    return response.data;
  }

  const response = await invoke<TauriRuntimeProxyResponse>('runtime_http_request', {
    request: {
      method: 'GET',
      url,
      headers: {
        'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
      },
      body: null,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`协议内容获取失败（${response.status} ${response.status_text}）`);
  }
  return response.data;
}

/** 获取当前生效的协议内容（隐私协议 / 服务协议） */
export async function fetchPublishedAgreement(kind: AgreementType): Promise<PublishedAgreement> {
  try {
    const payload = await requestPublishedAgreement(kind);
    if (payload && typeof payload === 'object' && 'code' in payload && payload.code !== 200) {
      throw new Error(String((payload as Record<string, unknown>).msg ?? '协议内容获取失败'));
    }
    return normalizePublishedAgreement(kind, payload);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      const message = responseData && typeof responseData === 'object'
        ? String((responseData as Record<string, unknown>).msg ?? '')
        : '';
      throw new Error(message || '协议内容获取失败，请检查网络连接后重试');
    }
    throw error instanceof Error ? error : new Error('协议内容获取失败，请稍后重试');
  }
}
