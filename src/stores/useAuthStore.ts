import { create } from 'zustand';

interface UserInfo {
  userId: string;
  userName: string;
  deptCode: string;
  deptName: string;
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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userInfo: null,
  permissions: [],

  setToken: (token) => set({ token }),
  setUserInfo: (userInfo) => set({ userInfo }),
  logout: () => set({ token: null, userInfo: null, permissions: [] }),
}));
