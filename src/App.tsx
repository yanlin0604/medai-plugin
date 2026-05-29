import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import Dashboard from './pages/Dashboard';
import RoundWorkbench from './pages/RoundWorkbench';
import DocEditor from './pages/DocEditor';
import Meeting from './pages/Meeting';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAuthStore } from './stores/useAuthStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="round" element={<RoundWorkbench />} />
            <Route path="doc-editor" element={<DocEditor />} />
            <Route path="doc-editor/:taskId" element={<DocEditor />} />
            <Route path="meeting" element={<Meeting />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
