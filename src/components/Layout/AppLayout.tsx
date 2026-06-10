import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { usePatientStore } from '../../stores/usePatientStore';
import { useBubbleStore } from '../../stores/useBubbleStore';
import {
  SearchOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  DisconnectOutlined,
  ImportOutlined,
  TeamOutlined,
  SwapOutlined,
  ProfileOutlined,
  CommentOutlined,
  SnippetsOutlined,
  SolutionOutlined,
  ScissorOutlined,
  RetweetOutlined,
  ExportOutlined,
  WarningOutlined,
  HeartOutlined,
  GroupOutlined,
  AudioOutlined,
  MinusOutlined,
  BorderOutlined,
  HomeOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { message, Modal } from 'antd';
import type { DocDefinition } from '../../config/docRegistry';
import { getActivePatient, getHostSession, HostSession } from '../../services/emsBridge';
import { collapseAssistantWindow } from '../../services/windowMode';
import { pluginRuntimeApi } from '../../services/pluginRuntime';

// 文书图标映射
const renderIcon = (iconName: string) => {
  const props = { className: 'text-xl text-[#1E3A8A]' };
  switch (iconName) {
    case 'HomeOutlined': return <HomeOutlined {...props} />;
    case 'ImportOutlined': return <ImportOutlined {...props} />;
    case 'FileTextOutlined': return <FileTextOutlined {...props} />;
    case 'ProfileOutlined': return <ProfileOutlined {...props} />;
    case 'TeamOutlined': return <TeamOutlined {...props} />;
    case 'GroupOutlined': return <GroupOutlined {...props} />;
    case 'SwapOutlined': return <SwapOutlined {...props} />;
    case 'RetweetOutlined': return <RetweetOutlined {...props} />;
    case 'SnippetsOutlined': return <SnippetsOutlined {...props} />;
    case 'SolutionOutlined': return <SolutionOutlined {...props} />;
    case 'HeartOutlined': return <HeartOutlined {...props} />;
    case 'ExportOutlined': return <ExportOutlined {...props} />;
    case 'WarningOutlined': return <WarningOutlined {...props} />;
    case 'CommentOutlined': return <CommentOutlined {...props} />;
    case 'ScissorOutlined': return <ScissorOutlined {...props} />;
    default: return <FileTextOutlined {...props} />;
  }
};

// 检测是否在 Tauri 环境中
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

// 无边框窗口自定义标题栏（拖拽 + 最小化/最大化/关闭）
const WindowTitleBar = () => {
  const collapse = useBubbleStore((state) => state.collapse);

  const handleCollapseToBubble = () => {
    collapse();
    void collapseAssistantWindow();
  };

  const handleMinimize = () => {
    if (isTauri) getCurrentWindow().minimize();
  };

  const handleToggleMaximize = () => {
    if (isTauri) getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    if (isTauri) getCurrentWindow().close();
  };

  return (
    <header
      data-tauri-drag-region
      className="h-14 px-5 bg-[#1E3A8A] flex items-center justify-between shrink-0 shadow-md select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-3 min-w-0">
        <div data-tauri-drag-region className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center border border-white/20 shadow-inner shrink-0 overflow-hidden">
          <FileTextOutlined className="text-white text-base" />
        </div>
        <div data-tauri-drag-region className="min-w-0">
          <h3 data-tauri-drag-region className="text-sm font-bold text-white tracking-wide truncate">
            病历书写助手
          </h3>
          <p data-tauri-drag-region className="text-[10px] text-blue-200 font-medium tracking-wide mt-0.5 truncate">
            住院病历 · 病历系统联动
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 -mr-2 text-white/80 relative z-10">
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleCollapseToBubble}
          className="w-8 h-8 rounded-md hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
          aria-label="收起为气泡"
          title="收起为气泡"
        >
          <SwapOutlined className="text-xs" />
        </button>
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleMinimize}
          className="w-8 h-8 rounded-md hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
          aria-label="最小化"
        >
          <MinusOutlined className="text-xs" />
        </button>
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleToggleMaximize}
          className="w-8 h-8 rounded-md hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
          aria-label="最大化或还原"
        >
          <BorderOutlined className="text-xs" />
        </button>
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={handleClose}
          className="w-8 h-8 rounded-md hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center"
          aria-label="关闭"
        >
          <CloseOutlined className="text-xs" />
        </button>
      </div>
    </header>
  );
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isLoggedIn,
    currentPatient,
    setLoggedIn,
    selectPatient,
    selectDoc,
  } = usePatientStore();

  const [session, setSession] = useState<HostSession | null>(null);
  const [runtimeDocs, setRuntimeDocs] = useState<DocDefinition[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');

  const loadRuntimeDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError('');
    try {
      const docs = await pluginRuntimeApi.listRuntimeDocuments();
      setRuntimeDocs(docs.filter((doc) => doc.code !== 'DOC000'));
      if (!docs.length) {
        setDocsError('后台未返回启用的运行时文书配置');
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '运行时文书目录加载失败';
      setRuntimeDocs([]);
      setDocsError(messageText);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // 启动时检测宿主病历系统连接
  useEffect(() => {
    getHostSession().then((s) => {
      setSession(s);
      if (s.online) setLoggedIn(true);
    });
  }, [setLoggedIn]);

  useEffect(() => {
    void loadRuntimeDocs();
  }, [loadRuntimeDocs]);

  // 从宿主病历系统读取当前活动患者
  const handleReadActivePatient = async () => {
    const p = await getActivePatient();
    if (p) {
      selectPatient(p);
      message.success(`已读取病历系统当前患者：${p.name}（住院号 ${p.id}）`);
    } else {
      message.warning('病历系统当前无活动患者，请先在病历系统中选定患者');
    }
  };

  // 解除患者关联
  const handleDisconnect = () => {
    selectPatient(null);
    message.info('已解除当前患者关联');
  };

  // 重新建立宿主系统连接
  const handleReconnect = async () => {
    message.loading({ content: '正在重新连接病历系统…', key: 'reconnect' });
    const s = await getHostSession();
    setSession(s);
    setLoggedIn(s.online);
    message.success({ content: '病历系统连接已就绪', key: 'reconnect', duration: 2 });
  };

  // 点击文书：未关联患者先引导读取，已关联则进入对应范式工作区
  const handleSelectDoc = (doc: DocDefinition) => {
    if (!currentPatient) {
      Modal.confirm({
        title: '需要关联患者',
        icon: <ExclamationCircleOutlined className="text-amber-500" />,
        content: `书写「${doc.name}」需要病历系统存在活动患者。是否读取当前活动患者并开始？`,
        okText: '读取并开始书写',
        cancelText: '取消',
        onOk: async () => {
          await handleReadActivePatient();
          selectDoc(doc);
          navigate(`/doc/${doc.code}`);
        },
      });
      return;
    }
    selectDoc(doc);
    navigate(`/doc/${doc.code}`);
  };

  // 子页面（范式工作区/查房/会议等）直接渲染 Outlet
  const isSubPage = location.pathname !== '/';
  if (isSubPage) {
    return (
      <div className="h-screen w-screen bg-[#F8FAFC] overflow-hidden flex flex-col font-sans select-none relative">
        <WindowTitleBar />
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] overflow-hidden flex flex-col font-sans select-none relative">
      <WindowTitleBar />

      {/* 主内容区域 - 无滚动 */}
      <div className="flex-1 flex flex-col px-4 py-3 gap-3">
        {/* 1. 病历系统连接状态 */}
        {isLoggedIn ? (
          <div className="px-3 py-2 bg-[#DCFCE7] border border-[#BBF7D0] rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#166534] font-bold">
              <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
              <span>{session ? `${session.deptName}：${session.doctorName}` : '病历系统已连接'}</span>
            </div>
            <button
              onClick={() => {
                setLoggedIn(false);
                selectPatient(null);
                message.info('已退出病历系统连接');
              }}
              className="text-[10px] text-[#166534]/70 font-bold hover:text-rose-600 transition-colors"
            >
              注销
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 bg-[#FFF5F5] border border-[#FEE2E2] rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#991B1B]">
              <DisconnectOutlined className="text-sm" />
              <span className="font-bold">未连接病历系统</span>
            </div>
            <button onClick={handleReconnect} className="text-[10px] text-[#1E3A8A] font-bold hover:underline">
              重新连接
            </button>
          </div>
        )}

        {/* 2. 活动患者卡片 */}
        <div className="rounded-lg overflow-hidden">
          {currentPatient ? (
            <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#10B981]"></div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-baseline gap-2">
                    <span>{currentPatient.name}</span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {currentPatient.gender} / {currentPatient.age}
                    </span>
                  </h4>
                  <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                    床位: {currentPatient.bedNo} | 住院号: {currentPatient.id}
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-[9px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded transition-colors"
                >
                  切换患者
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#F0F5FF]/40 border border-dashed border-[#DBEAFE] rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SearchOutlined className="text-slate-400" />
                <span className="text-[11px] font-bold text-slate-600">暂无当前活动患者</span>
              </div>
              <button
                onClick={handleReadActivePatient}
                className="bg-[#1E3A8A] hover:bg-[#172554] text-white text-[9px] px-2 py-1 rounded font-bold transition-all"
              >
                读取患者
              </button>
            </div>
          )}
        </div>

        {/* 3. 文书列表 - 紧凑网格 */}
        <div className="flex-1 overflow-hidden">
          {docsLoading ? (
            <div className="h-full bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center text-center px-6">
              <FileTextOutlined className="text-[#1E3A8A] text-2xl" />
              <p className="text-xs font-bold text-slate-700 mt-3">正在加载后台文书目录</p>
            </div>
          ) : docsError || runtimeDocs.length === 0 ? (
            <div className="h-full bg-white border border-rose-100 rounded-lg flex flex-col items-center justify-center text-center px-6">
              <ExclamationCircleOutlined className="text-rose-500 text-2xl" />
              <p className="text-xs font-bold text-slate-800 mt-3">文书目录不可用</p>
              <p className="text-[10px] text-slate-400 mt-1 leading-5">{docsError || '后台未返回启用的运行时文书配置'}</p>
              <button
                onClick={() => void loadRuntimeDocs()}
                className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white hover:bg-blue-50 transition-colors"
              >
                重新加载
              </button>
            </div>
          ) : (
            <div className="h-full grid grid-cols-2 gap-2.5 content-start">
              {runtimeDocs.map((doc) => (
              <button
                key={doc.code}
                onClick={() => handleSelectDoc(doc)}
                className="flex items-center gap-2.5 px-3 py-3 bg-white border border-slate-200 hover:border-[#1E3A8A] hover:shadow-md rounded-lg transition-all text-left group"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#F0F5FF] group-hover:bg-[#DBEAFE] transition-colors shrink-0">
                  {renderIcon(doc.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-slate-800 group-hover:text-[#1E3A8A] truncate transition-colors">
                    {doc.name}
                  </div>
                </div>
              </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右下角查房悬浮按钮 */}
      <button
        onClick={() => {
          if (!currentPatient) {
            message.warning('请先关联患者以启用床旁录音查房工作台');
            return;
          }
          navigate('/round');
        }}
        className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-[#1E3A8A] hover:bg-[#172554] flex items-center justify-center text-white text-lg shadow-lg hover:scale-105 transition-all z-50 cursor-pointer border border-blue-800"
        title="开启床旁录音查房工作台"
      >
        <AudioOutlined />
      </button>
    </div>
  );
}
