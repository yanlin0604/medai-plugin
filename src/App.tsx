import { useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import BubbleShell from './components/Layout/BubbleShell';
import ExpandedEmrContextBridge from './components/Layout/ExpandedEmrContextBridge';
import RoundWorkbench from './pages/RoundWorkbench';
import DocWorkspace from './pages/DocWorkspace';
import Meeting from './pages/Meeting';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Profile from './pages/Profile';
import ProfileEdit from './pages/ProfileEdit';
import { useAuthStore } from './stores/useAuthStore';
import { useBubbleStore } from './stores/useBubbleStore';
import { collapseAssistantWindow, expandAssistantWindow } from './services/windowMode';

message.config({
  top: 24,
  duration: 2,
  maxCount: 3,
  getContainer: () => document.getElementById('root') ?? document.body,
});

function AppShell() {
  const mode = useBubbleStore((state) => state.mode);
  const token = useAuthStore((state) => state.token);

  // 应用启动时初始化窗口位置：完整面板靠右全高，气泡模式悬浮右下角
  useEffect(() => {
    if (!token || mode === 'expanded') {
      void expandAssistantWindow();
      return;
    }

    void collapseAssistantWindow();
  }, [mode, token]);

  if (mode !== 'expanded' && token) {
    return <BubbleShell />;
  }

  return (
    <>
      {token ? <ExpandedEmrContextBridge /> : null}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<div className="h-full flex items-center justify-center text-slate-400 bg-white shadow-inner rounded-xl m-4 border-2 border-dashed border-slate-200">欢迎使用 AI 医疗查房与文书系统。请在左侧选择操作项。</div>} />
          <Route path="round" element={<RoundWorkbench />} />
          <Route path="doc/:code" element={<DocWorkspace />} />
          <Route path="meeting" element={<Meeting />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<ProfileEdit />} />
        </Route>
      </Routes>
    </>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F12') return;
      event.preventDefault();
      void invoke('toggle_devtools').catch((error) => {
        console.error('打开调试工具失败', error);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ConfigProvider>
  );
}
