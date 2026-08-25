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
  userInfo: UserInfo;
}

export interface ChangePasswordCredentials {
  oldPassword: string;
  newPassword: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const LOGIN_PATH = String(import.meta.env.VITE_AUTH_LOGIN_PATH ?? '').trim();
const MOCK_LOGIN_ENABLED =
  import.meta.env.DEV || String(import.meta.env.VITE_AUTH_MOCK ?? '').trim() === '1';

function buildLoginUrl() {
  if (/^https?:\/\//i.test(LOGIN_PATH)) return LOGIN_PATH;
  return `${API_BASE_URL}${LOGIN_PATH.startsWith('/') ? '' : '/'}${LOGIN_PATH}`;
}

function normalizeLoginResult(payload: unknown): LoginResult {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const data = body.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown>
    : body;
  const user = data.userInfo && typeof data.userInfo === 'object'
    ? data.userInfo as Record<string, unknown>
    : data.user && typeof data.user === 'object'
      ? data.user as Record<string, unknown>
      : {};

  const token = String(data.token ?? data.accessToken ?? '').trim();
  const userId = String(user.userId ?? user.id ?? data.userId ?? '').trim();
  const userName = String(user.userName ?? user.name ?? data.userName ?? '').trim();

  if (!token || !userId || !userName) {
    throw new Error('登录接口返回的数据不完整，请检查 token 和用户信息字段。');
  }

  return {
    token,
    userInfo: {
      userId,
      userName,
      deptCode: String(user.deptCode ?? data.deptCode ?? '').trim(),
      deptName: String(user.deptName ?? data.deptName ?? '病历系统').trim(),
      title: String(user.title ?? data.title ?? '').trim() || undefined,
      avatar: String(user.avatar ?? data.avatar ?? '').trim() || undefined,
      roles: Array.isArray(user.roles)
        ? user.roles.map((role) => String(role))
        : [],
    },
  };
}

function mockLogin({ username, password }: LoginCredentials): LoginResult {
  if (username !== 'demo' || password !== 'demo123') {
    throw new Error('账号或密码错误。演示环境请使用 demo / demo123。');
  }

  return {
    token: `demo-token-${Date.now()}`,
    userInfo: {
      userId: 'demo-doctor',
      userName: '林志远',
      deptCode: 'CARDIOLOGY',
      deptName: '心血管内科',
      roles: ['doctor'],
    },
  };
}

interface TauriRuntimeProxyResponse {
  status: number;
  status_text: string;
  data: unknown;
}

async function requestLogin(credentials: LoginCredentials): Promise<unknown> {
  if (!isTauriRuntime()) {
    const response = await axios.post(buildLoginUrl(), credentials, {
      headers: { 'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456' },
    });
    return response.data;
  }

  const response = await invoke<TauriRuntimeProxyResponse>('runtime_http_request', {
    request: {
      method: 'POST',
      url: buildLoginUrl(),
      headers: {
        'Content-Type': 'application/json',
        'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
      },
      body: credentials,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`登录请求失败（${response.status} ${response.status_text}）。`);
  }
  return response.data;
}

/**
 * 真实环境只需要配置 VITE_AUTH_LOGIN_PATH，并保持返回 token + userInfo。
 * 开发环境保留 demo / demo123，便于产品联调登录页和注销流程。
 */
export async function loginWithPassword(credentials: LoginCredentials): Promise<LoginResult> {
  if (LOGIN_PATH) {
    try {
      const payload = await requestLogin(credentials);
      if (payload && typeof payload === 'object' && 'code' in payload && payload.code !== 200) {
        throw new Error(String(payload.msg ?? '账号或密码错误。'));
      }
      return normalizeLoginResult(payload);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        const message = responseData && typeof responseData === 'object'
          ? String((responseData as Record<string, unknown>).msg ?? '')
          : '';
        throw new Error(message || '登录请求失败，请检查网络连接后重试。');
      }
      throw error instanceof Error ? error : new Error('登录失败，请稍后重试。');
    }
  }

  if (MOCK_LOGIN_ENABLED) return mockLogin(credentials);

  throw new Error('尚未配置账号密码登录接口，请设置 VITE_AUTH_LOGIN_PATH。');
}

export async function changePassword(credentials: ChangePasswordCredentials): Promise<void> {
  const path = String(import.meta.env.VITE_AUTH_PASSWORD_PATH ?? '').trim();
  if (!path) {
    if (import.meta.env.DEV) {
      if (credentials.oldPassword !== 'demo123') {
        throw new Error('原密码错误。开发演示账号原密码为 demo123。');
      }
      return;
    }
    throw new Error('尚未配置修改密码接口，请设置 VITE_AUTH_PASSWORD_PATH。');
  }

  const url = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    const token = sessionStorage.getItem('medaiPlugin.authToken') ?? '';
    let payload: unknown;

    if (isTauriRuntime()) {
      const response = await invoke<TauriRuntimeProxyResponse>('runtime_http_request', {
        request: {
          method: 'POST',
          url,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
          },
          body: credentials,
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`修改密码请求失败（${response.status} ${response.status_text}）。`);
      }
      payload = response.data;
    } else {
      const response = await axios.post(url, credentials, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Plugin-Key': import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456',
        },
      });
      payload = response.data;
    }

    if (payload && typeof payload === 'object' && 'code' in payload && payload.code !== 200) {
      throw new Error(String(payload.msg ?? '修改密码失败。'));
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      const message = responseData && typeof responseData === 'object'
        ? String((responseData as Record<string, unknown>).msg ?? '')
        : '';
      throw new Error(message || '修改密码失败，请检查网络连接后重试。');
    }
    throw error instanceof Error ? error : new Error('修改密码失败，请稍后重试。');
  }
}
