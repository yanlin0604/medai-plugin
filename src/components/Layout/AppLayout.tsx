import { Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-gray-800 text-white p-4">
        <h2 className="text-lg font-bold mb-4">AI住院部助手</h2>
        <nav className="space-y-2">
          <a href="/dashboard" className="block py-1 hover:text-blue-300">仪表板</a>
          <a href="/round" className="block py-1 hover:text-blue-300">查房工作台</a>
          <a href="/doc-editor" className="block py-1 hover:text-blue-300">文书编辑器</a>
          <a href="/meeting" className="block py-1 hover:text-blue-300">会议讨论</a>
          <a href="/settings" className="block py-1 hover:text-blue-300">设置</a>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
