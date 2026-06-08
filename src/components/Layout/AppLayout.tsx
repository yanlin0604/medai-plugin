import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../../../src-tauri/icons/app-icon-64.png';
import { usePatientStore } from '../../stores/usePatientStore';
import { useBubbleStore } from '../../stores/useBubbleStore';
import {
  SearchOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  DisconnectOutlined,
  ArrowRightOutlined,
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
  EditOutlined,
  ClockCircleOutlined,
  AudioOutlined,
  CloseOutlined,
  MinusOutlined,
  BorderOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { message, Modal } from 'antd';
import {
  DocDefinition,
  PARADIGMS,
  DOC_GROUPS,
  DOC_GROUP_ORDER,
  getDocsByGroup,
  searchDocs,
} from '../../config/docRegistry';
import { getActivePatient, getHostSession, HostSession } from '../../services/emsBridge';
import { collapseAssistantWindow } from '../../services/windowMode';
import ClipboardWritebackAssistant from '../clinical/ClipboardWritebackAssistant';

// 文书最近更新状态（TODO: 由宿主病历系统文书完成状态联动）
const docStatus: Record<string, string> = {
  DOC000: '最后更新: 出院时',
  DOC001: '最后更新: 3天前',
  DOC002: '最后更新: 10分钟前',
  DOC003: '最后更新: 1小时前',
  DOC006: '最后更新: 2天前',
  DOC008: '最后更新: 1周前',
  DOC013: '最后更新: 昨天 10:45',
};

// 文书图标映射
const renderIcon = (iconName: string) => {
  const props = { className: 'text-lg text-slate-500' };
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

// 范式徽章（沿用范式 accent 配色，弱化但可辨识）
const ParadigmBadge = ({ paradigm }: { paradigm: DocDefinition['paradigm'] }) => {
  const p = PARADIGMS[paradigm];
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none whitespace-nowrap"
      style={{ color: p.accent, background: `${p.accent}14`, borderColor: `${p.accent}33` }}
      title={p.desc}
    >
      {p.badge}
    </span>
  );
};

// 分组标题色（红/绿/灰）
const groupTitleColor: Record<'red' | 'green' | 'gray', string> = {
  red: 'text-rose-600',
  green: 'text-emerald-600',
  gray: 'text-slate-500',
};
const groupBarColor: Record<'red' | 'green' | 'gray', string> = {
  red: 'bg-rose-500',
  green: 'bg-emerald-500',
  gray: 'bg-slate-400',
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
          <img src={appIcon} alt="" className="w-6 h-6 object-contain" draggable={false} />
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
    recommendedDoc,
    setLoggedIn,
    selectPatient,
    selectDoc,
  } = usePatientStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [session, setSession] = useState<HostSession | null>(null);

  // 启动时检测宿主病历系统连接
  useEffect(() => {
    getHostSession().then((s) => {
      setSession(s);
      if (s.online) setLoggedIn(true);
    });
  }, [setLoggedIn]);

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

  // 检索（中文名 + 拼音首字母）
  const matched = searchDocs(searchQuery);
  const matchedCodes = new Set(matched.map((d) => d.code));

  // 子页面（范式工作区/查房/会议等）直接渲染 Outlet
  const isSubPage = location.pathname !== '/';
  if (isSubPage) {
    return (
      <div className="h-screen w-screen bg-[#F8FAFC] overflow-hidden flex flex-col font-sans select-none relative">
        <WindowTitleBar />
        <Outlet />
        <ClipboardWritebackAssistant />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] overflow-hidden flex flex-col font-sans select-none relative">
      <WindowTitleBar />

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-4.5 py-4 space-y-4 pb-20">
        {/* 1. 病历系统连接状态 */}
        {isLoggedIn ? (
          <div className="p-3 bg-[#DCFCE7] border border-[#BBF7D0] rounded-xl flex items-center justify-between text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-[#166534] font-bold">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse"></div>
              <span>{session ? `${session.deptName}：${session.doctorName}` : '病历系统已连接'}</span>
            </div>
            <button
              onClick={() => {
                setLoggedIn(false);
                selectPatient(null);
                message.info('已退出病历系统连接');
              }}
              className="text-[10px] text-[#166534]/70 font-extrabold hover:text-rose-600 transition-colors"
            >
              注销
            </button>
          </div>
        ) : (
          <div className="p-3.5 bg-[#FFF5F5] border border-[#FEE2E2] rounded-xl flex items-center justify-between text-xs animate-fade-in shadow-sm">
            <div className="flex items-start gap-2.5 text-[#991B1B]">
              <div className="w-7 h-7 rounded-full bg-[#FEE2E2] flex items-center justify-center text-rose-600 shrink-0">
                <DisconnectOutlined className="text-sm" />
              </div>
              <div>
                <h4 className="font-extrabold text-[12px] text-slate-800">未连接病历系统</h4>
                <p className="text-[10px] text-[#EF4444] font-bold mt-0.5">未检测到病历系统登录信息</p>
              </div>
            </div>
            <button onClick={handleReconnect} className="text-[11px] text-[#1E3A8A] font-extrabold hover:underline">
              重新连接
            </button>
          </div>
        )}

        {/* 2. 活动患者卡片 */}
        <div className="relative rounded-xl overflow-hidden transition-all duration-300">
          {currentPatient ? (
            <div className="p-4 bg-white border border-slate-200 rounded-xl relative shadow-sm hover:shadow-md transition-all animate-fade-in">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#10B981]"></div>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 flex items-baseline gap-2">
                    <span>{currentPatient.name}</span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {currentPatient.gender} / {currentPatient.age}
                    </span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-1.5">
                    床位: {currentPatient.bedNo} | 住院号: {currentPatient.id}
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-[9px] font-extrabold text-rose-600 hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded transition-colors"
                >
                  切换患者
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#F0F5FF]/40 border-2 border-dashed border-[#DBEAFE] rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm select-none animate-fade-in group hover:bg-[#F0F5FF]/70 transition-all">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                <SearchOutlined className="text-base" />
              </div>
              <h4 className="text-[13px] font-extrabold text-slate-800 mt-3">暂无当前活动患者</h4>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mt-1.5 px-2">
                请在病历系统中选择患者，或点击下方读取当前活动患者
              </p>
              <button
                onClick={handleReadActivePatient}
                className="mt-4 bg-[#1E3A8A] hover:bg-[#172554] text-white text-[10px] px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-md shadow-blue-900/10"
              >
                读取当前患者
              </button>
            </div>
          )}
        </div>

        {/* 3. 书写时限提醒 */}
        <div className="bg-white border-2 border-[#DBEAFE] hover:border-blue-300 rounded-xl p-3.5 transition-all shadow-sm">
          {currentPatient && recommendedDoc ? (
            <div
              onClick={() => handleSelectDoc(recommendedDoc)}
              className="cursor-pointer space-y-2 group animate-fade-in"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold bg-[#1E3A8A] text-white px-2 py-0.5 rounded flex items-center gap-1">
                  <ClockCircleOutlined className="text-[9px]" /> 时限提醒
                </span>
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  时限临近
                </span>
                <ParadigmBadge paradigm={recommendedDoc.paradigm} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#1E3A8A] transition-colors flex items-center justify-between">
                  <span>{recommendedDoc.name}</span>
                  <ArrowRightOutlined className="text-[10px] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </h4>
                <p className="text-[10px] text-slate-400 font-bold leading-normal mt-1">
                  患者入院已12小时，{recommendedDoc.timeLimit || '书写时限'}将至，建议尽快书写。
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 py-2 animate-fade-in">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                <ClockCircleOutlined className="text-sm" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold bg-[#E0F2FE] text-[#0369A1] px-1.5 py-0.5 rounded">书写时限提醒</span>
                <p className="text-[11px] text-slate-500 font-bold leading-normal">关联患者后显示待写文书与时限提醒</p>
              </div>
            </div>
          )}
        </div>

        {/* 4. 搜索框 */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <SearchOutlined className="text-xs" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文书 (支持首字母如 sc/ry)"
            className="w-full bg-white border border-slate-200 focus:border-[#1E3A8A] focus:ring-1 focus:ring-[#1E3A8A] rounded-lg pl-9 pr-4 py-2 text-[11px] text-slate-800 outline-none transition-all placeholder:text-slate-400 placeholder:font-bold shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <CloseOutlined />
            </button>
          )}
        </div>

        {/* 5. 14 类病历文书列表（按三组分类） */}
        <div className="space-y-4">
          {DOC_GROUP_ORDER.map((groupId) => {
            const group = DOC_GROUPS[groupId];
            const docs = getDocsByGroup(groupId).filter((d) => matchedCodes.has(d.code));
            if (docs.length === 0) return null;

            return (
              <div key={groupId} className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden shadow-sm">
                <div className="bg-[#F8FAFC] px-3 py-2 text-[12px] font-bold border-b border-[#E2E8F0] flex items-center gap-2">
                  <span className={`w-1 h-3.5 rounded-full ${groupBarColor[group.tagColor]}`}></span>
                  <span className={groupTitleColor[group.tagColor]}>{group.name}</span>
                  <span className="text-[10px] text-slate-300 font-medium">{docs.length}</span>
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {docs.map((doc) => (
                    <div
                      key={doc.code}
                      onClick={() => handleSelectDoc(doc)}
                      className="p-3 hover:bg-slate-50 transition-all relative cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-6 shrink-0">{renderIcon(doc.icon)}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-bold text-slate-800">{doc.name}</span>
                            <ParadigmBadge paradigm={doc.paradigm} />
                            {doc.timeLimit && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-medium leading-none bg-rose-50 text-rose-500 border border-rose-100">
                                {doc.timeLimit}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 truncate">
                            {docStatus[doc.code] || '尚未创建'} · 来源 {doc.dataSources.join('·')}
                          </p>
                        </div>
                      </div>
                      <button className="shrink-0 flex items-center justify-center gap-1 text-[11px] font-medium text-[#2563EB] border border-[#2563EB] hover:bg-blue-50 px-2 py-1 rounded transition-all ml-2">
                        <EditOutlined className="text-[12px]" />
                        书写
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {matched.length === 0 && (
            <div className="text-center text-[11px] text-slate-400 py-8 font-medium">
              未找到匹配「{searchQuery}」的文书
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
        className="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-[#1E3A8A] hover:bg-[#172554] flex items-center justify-center text-white text-xl shadow-lg hover:scale-105 transition-all z-50 cursor-pointer border border-blue-800"
        title="开启床旁录音查房工作台"
      >
        <AudioOutlined />
      </button>
      <ClipboardWritebackAssistant />
    </div>
  );
}
