import { create } from 'zustand';

export interface UserInfo {
  userId: string;
  userName: string;
  deptCode: string;
  deptName: string;
  title?: string;
  avatar?: string;
  roles: string[];
}

interface AuthState {
  token: string | null;
  userInfo: UserInfo | null;
  permissions: string[];

  setToken: (token: string) => void;
  setUserInfo: (info: UserInfo) => void;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'medaiPlugin.authToken';
const USER_STORAGE_KEY = 'medaiPlugin.authUserInfo';
const authStorage = typeof sessionStorage === 'undefined' ? null : sessionStorage;

function readStoredUserInfo(): UserInfo | null {
  try {
    const raw = authStorage?.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as UserInfo : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: authStorage?.getItem(TOKEN_STORAGE_KEY) ?? null,
  userInfo: readStoredUserInfo(),
  permissions: [],

  setToken: (token) => {
    authStorage?.setItem(TOKEN_STORAGE_KEY, token);
    set({ token });
  },
  setUserInfo: (userInfo) => {
    authStorage?.setItem(USER_STORAGE_KEY, JSON.stringify(userInfo));
    set({ userInfo });
  },
  logout: () => {
    authStorage?.removeItem(TOKEN_STORAGE_KEY);
    authStorage?.removeItem(USER_STORAGE_KEY);
    set({ token: null, userInfo: null, permissions: [] });
  },
}));
