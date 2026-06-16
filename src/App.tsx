import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import BubbleShell from './components/Layout/BubbleShell';
import ExpandedEmrContextBridge from './components/Layout/ExpandedEmrContextBridge';
import RoundWorkbench from './pages/RoundWorkbench';
import DocWorkspace from './pages/DocWorkspace';
import Meeting from './pages/Meeting';
import Settings from './pages/Settings';
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

  // 应用启动时初始化窗口位置：完整面板靠右全高，气泡模式悬浮右下角
  useEffect(() => {
    if (mode === 'expanded') {
      void expandAssistantWindow();
      return;
    }

    void collapseAssistantWindow();
  }, [mode]);

  if (mode !== 'expanded') {
    return <BubbleShell />;
  }

  return (
    <>
      <ExpandedEmrContextBridge />
      <Routes>
        <Route
          path="/"
          element={<AppLayout />}
        >
          <Route index element={<div className="h-full flex items-center justify-center text-slate-400 bg-white shadow-inner rounded-xl m-4 border-2 border-dashed border-slate-200">欢迎使用 AI 医疗查房与文书系统。请在左侧选择操作项。</div>} />
          <Route path="round" element={<RoundWorkbench />} />
          {/* 范式驱动文书工作区：按文书范式分发到对应容器 */}
          <Route path="doc/:code" element={<DocWorkspace />} />
          <Route path="meeting" element={<Meeting />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
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
