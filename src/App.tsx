import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import BubbleShell from './components/Layout/BubbleShell';
import RoundWorkbench from './pages/RoundWorkbench';
import DocWorkspace from './pages/DocWorkspace';
import Meeting from './pages/Meeting';
import Settings from './pages/Settings';
import { useBubbleStore } from './stores/useBubbleStore';
import { collapseAssistantWindow } from './services/windowMode';

function AppShell() {
  const mode = useBubbleStore((state) => state.mode);

  // 应用启动时初始化窗口位置（气泡模式）
  useEffect(() => {
    if (mode !== 'expanded') {
      void collapseAssistantWindow();
    }
  }, []);

  if (mode !== 'expanded') {
    return <BubbleShell />;
  }

  return (
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
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ConfigProvider>
  );
}
