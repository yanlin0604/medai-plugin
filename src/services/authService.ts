import axios from 'axios';
import { invoke } from '@tauri-apps/api/core';
import type { UserInfo } from '../stores/useAuthStore';
import { isTauriRuntime } from './windowMode';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  scope?: string;
  openid?: string;
  clientId?: string;
  userInfo: UserInfo;
}

export interface ProfileInfo extends UserInfo {}

export interface ProfileUpdateRequest {
  userName?: string;
  deptCode?: string;
  title?: string;
  avatarOssId?: string;
}

export interface ProfileAvatarUploadResult {
  avatarOssId?: string;
  avatar?: string;
  avatarUrl?: string;
  url?: string;
  fileUrl?: string;
}

export interface ChangePasswordCredentials {
  oldPassword: string;
  newPassword: string;
}

interface RuntimeApiResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
}

interface LoginUserVo extends Partial<Omit<UserInfo, 'avatarOssId' | 'roles'>> {
  id?: string | number;
  name?: string;
  nickName?: string;
  avatarUrl?: string;
  avatarOssId?: string | number;
  roles?: unknown[];
}

interface LoginVo {
  scope?: string;
  openid?: string;
  access_token?: string;
  accessToken?: string;
  token?: string;
  refresh_token?: string;
  refreshToken?: string;
  expire_in?: number;
  expiresIn?: number;
  refresh_expire_in?: number;
  refreshExpiresIn?: number;
  client_id?: string;
  clientId?: string;
  userInfo?: LoginUserVo;
  user?: LoginUserVo;
  userId?: string | number;
  userName?: string;
  deptCode?: string;
  deptName?: string;
  title?: string;
  avatar?: string;
  avatarUrl?: string;
  avatarOssId?: string | number;
  roles?: unknown[];
}

interface TauriRuntimeProxyResponse {
  status: number;
  status_text: string;
  data: unknown;
}

interface TauriRuntimeBinaryResponse {
  status: number;
  status_text: string;
  content_type: string;
  data_base64: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const LOGIN_PATH = String(import.meta.env.VITE_AUTH_LOGIN_PATH ?? '/medical/pluginAuth/login').trim()
  || '/medical/pluginAuth/login';
const LOGOUT_PATH = String(import.meta.env.VITE_AUTH_LOGOUT_PATH ?? '/auth/logout').trim() || '/auth/logout';
const PASSWORD_PATH = String(import.meta.env.VITE_AUTH_PASSWORD_PATH ?? '/medical/pluginAuth/password').trim()
  || '/medical/pluginAuth/password';
const PLUGIN_KEY = import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456';

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function isSuccessCode(code: unknown): boolean {
  return code === 0 || code === 200;
}

function unwrapApiResponse<T>(payload: unknown, fallbackMessage: string): T {
  if (!payload || typeof payload !== 'object') {
    throw new Error(fallbackMessage);
  }

  const body = payload as RuntimeApiResponse<T>;
  if ('code' in body) {
    if (!isSuccessCode(body.code)) {
      throw new Error(body.msg || fallbackMessage);
    }
    return body.data as T;
  }

  return payload as T;
}

function normalizeRoles(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.map((role) => String(role)) : fallback;
}

function readNumber(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function readId(...values: unknown[]): string | undefined {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return value === undefined ? undefined : String(value).trim();
}

function normalizeResourceUrl(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const markdownLink = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i.exec(raw);
  return markdownLink ? markdownLink[2].trim() : raw;
}

function normalizeLoginResult(payload: unknown, credentials: LoginCredentials): LoginResult {
  const data = unwrapApiResponse<LoginVo>(payload, '\u767b\u5f55\u5931\u8d25');
  const token = String(data.access_token ?? data.accessToken ?? data.token ?? '').trim();
  if (!token) throw new Error('\u767b\u5f55\u63a5\u53e3\u672a\u8fd4\u56de access_token');

  const user = data.userInfo ?? data.user ?? {};
  const userId = String(user.userId ?? user.id ?? data.userId ?? data.openid ?? credentials.username).trim();
  const userName = String(user.userName ?? user.name ?? data.userName ?? credentials.username).trim();

  return {
    token,
    refreshToken: String(data.refresh_token ?? data.refreshToken ?? '').trim() || undefined,
    expiresIn: readNumber(data.expire_in ?? data.expiresIn),
    refreshExpiresIn: readNumber(data.refresh_expire_in ?? data.refreshExpiresIn),
    scope: data.scope,
    openid: data.openid,
    clientId: data.client_id ?? data.clientId,
    userInfo: {
      userId,
      userName,
      deptCode: String(user.deptCode ?? data.deptCode ?? '').trim(),
      deptName: String(user.deptName ?? data.deptName ?? '\u75c5\u5386\u7cfb\u7edf').trim(),
      title: String(user.title ?? data.title ?? '').trim() || undefined,
      avatar: normalizeResourceUrl(user.avatar ?? data.avatar ?? user.avatarUrl ?? data.avatarUrl),
      avatarOssId: readId(user.avatarOssId, data.avatarOssId),
      roles: normalizeRoles(user.roles ?? data.roles, ['doctor']),
    },
  };
}

function normalizeProfile(payload: unknown, fallback: Partial<UserInfo> = {}): ProfileInfo {
  const raw = unwrapApiResponse<Record<string, unknown>>(payload, '\u4e2a\u4eba\u8d44\u6599\u52a0\u8f7d\u5931\u8d25') ?? {};
  const data = raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : raw;
  const nested = data.userInfo && typeof data.userInfo === 'object'
    ? data.userInfo as Record<string, unknown>
    : data.user && typeof data.user === 'object'
      ? data.user as Record<string, unknown>
      : data;
  const avatarOssId = readId(nested.avatarOssId, data.avatarOssId, fallback.avatarOssId);

  return {
    userId: String(nested.userId ?? nested.id ?? data.userId ?? fallback.userId ?? '').trim(),
    userName: String(nested.userName ?? nested.nickName ?? nested.name ?? data.userName ?? fallback.userName ?? '').trim(),
    deptCode: String(nested.deptCode ?? data.deptCode ?? fallback.deptCode ?? '').trim(),
    deptName: String(nested.deptName ?? data.deptName ?? fallback.deptName ?? nested.deptCode ?? fallback.deptCode ?? '').trim(),
    title: String(nested.title ?? data.title ?? fallback.title ?? '').trim() || undefined,
    avatar: normalizeResourceUrl(nested.avatar ?? nested.avatarUrl ?? data.avatar ?? data.avatarUrl ?? fallback.avatar),
    avatarOssId,
    roles: normalizeRoles(nested.roles ?? data.roles, fallback.roles ?? []),
  };
}

function normalizeRequestError(error: unknown, fallbackMessage: string): Error {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const msg = data && typeof data === 'object'
      ? String((data as Record<string, unknown>).msg ?? '')
      : '';
    return new Error(msg || fallbackMessage);
  }
  return error instanceof Error ? error : new Error(fallbackMessage);
}

async function requestJson(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Plugin-Key': PLUGIN_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!isTauriRuntime()) {
    const response = await axios.request({ method, url, data: body, headers });
    return response.data;
  }

  const response = await invoke<TauriRuntimeProxyResponse>('runtime_http_request', {
    request: { method, url, headers, body: body ?? null },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${url} (${response.status} ${response.status_text})`);
  }
  return response.data;
}

async function uploadMultipart(url: string, file: File, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'X-Plugin-Key': PLUGIN_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!isTauriRuntime()) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(url, { method: 'POST', headers, body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${url} (${response.status})`);
    return payload;
  }

  const body = Array.from(new Uint8Array(await file.arrayBuffer()));
  const response = await invoke<TauriRuntimeProxyResponse>('runtime_multipart_request', {
    request: {
      method: 'POST',
      url,
      headers,
      field_name: 'file',
      file_name: file.name,
      mime_type: file.type || null,
      body,
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${url} (${response.status} ${response.status_text})`);
  }
  return response.data;
}

export async function loginWithPassword(credentials: LoginCredentials): Promise<LoginResult> {
  try {
    const payload = await requestJson('POST', buildUrl(LOGIN_PATH), credentials);
    return normalizeLoginResult(payload, credentials);
  } catch (error) {
    throw normalizeRequestError(error, '\u767b\u5f55\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
  }
}

export async function logoutFromServer(token?: string | null): Promise<void> {
  try {
    const payload = await requestJson('POST', buildUrl(LOGOUT_PATH), null, token ?? undefined);
    if (payload && typeof payload === 'object' && 'code' in payload) {
      unwrapApiResponse<unknown>(payload, '\u9000\u51fa\u767b\u5f55\u5931\u8d25');
    }
  } catch (error) {
    throw normalizeRequestError(error, '\u9000\u51fa\u767b\u5f55\u5931\u8d25');
  }
}

export async function getProfile(fallback?: Partial<UserInfo>): Promise<ProfileInfo> {
  try {
    const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
    const payload = await requestJson('GET', buildUrl('/medical/pluginAuth/profile'), undefined, token);
    return normalizeProfile(payload, fallback);
  } catch (error) {
    throw normalizeRequestError(error, '\u4e2a\u4eba\u8d44\u6599\u52a0\u8f7d\u5931\u8d25');
  }
}

export async function updateProfile(
  request: ProfileUpdateRequest,
  fallback?: Partial<UserInfo>,
): Promise<ProfileInfo> {
  try {
    const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
    const payload = await requestJson('PUT', buildUrl('/medical/pluginAuth/profile'), request, token);
    return normalizeProfile(payload ?? {}, { ...fallback, ...request });
  } catch (error) {
    throw normalizeRequestError(error, '\u4e2a\u4eba\u8d44\u6599\u4fdd\u5b58\u5931\u8d25');
  }
}

export async function uploadProfileAvatar(file: File): Promise<ProfileAvatarUploadResult> {
  try {
    const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
    const payload = await uploadMultipart(buildUrl('/medical/pluginAuth/profile/avatar'), file, token);
    const data = unwrapApiResponse<Record<string, unknown>>(payload, '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25') ?? {};
    const avatarOssId = readId(data.avatarOssId, data.ossId, data.id);
    return {
      avatarOssId,
      avatar: normalizeResourceUrl(data.avatar),
      avatarUrl: normalizeResourceUrl(data.avatarUrl),
      url: normalizeResourceUrl(data.url),
      fileUrl: normalizeResourceUrl(data.fileUrl),
    };
  } catch (error) {
    throw normalizeRequestError(error, '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25');
  }
}

export async function resolveAvatarDisplayUrl(avatar?: string): Promise<string> {
  const normalizedAvatar = normalizeResourceUrl(avatar);
  if (!normalizedAvatar) return '';
  if (/^(data|blob):/i.test(normalizedAvatar) || !isTauriRuntime()) return normalizedAvatar;

  const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
  const headers: Record<string, string> = {
    Accept: 'image/*',
    'X-Plugin-Key': PLUGIN_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await invoke<TauriRuntimeBinaryResponse>('runtime_binary_request', {
    request: {
      url: normalizedAvatar,
      headers,
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${normalizedAvatar} (${response.status} ${response.status_text})`);
  }

  return `data:${response.content_type || 'image/png'};base64,${response.data_base64}`;
}

export async function changePassword(credentials: ChangePasswordCredentials): Promise<void> {
  try {
    const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
    const payload = await requestJson('POST', buildUrl(PASSWORD_PATH), credentials, token);
    if (payload && typeof payload === 'object' && 'code' in payload) {
      unwrapApiResponse<unknown>(payload, '\u4fee\u6539\u5bc6\u7801\u5931\u8d25');
    }
  } catch (error) {
    throw normalizeRequestError(error, '\u4fee\u6539\u5bc6\u7801\u5931\u8d25');
  }
}
