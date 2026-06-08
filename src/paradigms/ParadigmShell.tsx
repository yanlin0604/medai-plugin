import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { usePatientStore } from '../stores/usePatientStore';
import { DocDefinition, PARADIGMS } from '../config/docRegistry';

interface ParadigmShellProps {
  doc: DocDefinition;
  /** 右上角操作区（如提交、历史等操作） */
  actions?: ReactNode;
  /** 是否显示范式标签 */
  showParadigmBadge?: boolean;
  /** 是否显示页头患者住院号 */
  showPatientId?: boolean;
  children: ReactNode;
}

/**
 * 范式统一外壳：所有范式页共享的顶部导航栏（返回 + 文书名 + 范式徽章 + 患者条）。
 * 范式特定内容通过 children 注入，右上角操作通过 actions 注入。
 * 对应需求"范式透明化展示"——侧边栏始终显示当前范式标签。
 */
export default function ParadigmShell({ doc, actions, showParadigmBadge = true, showPatientId = true, children }: ParadigmShellProps) {
  const navigate = useNavigate();
  const { currentPatient, selectDoc } = usePatientStore();
  const paradigm = PARADIGMS[doc.paradigm];

  const handleBack = () => {
    selectDoc(null);
    navigate('/');
  };

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] overflow-hidden">
      {/* 顶部导航栏 */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10 relative">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-slate-500 hover:text-slate-800 transition-colors p-1"
            title="返回文书选择中心"
          >
            <ArrowLeftOutlined className="text-sm font-bold" />
          </button>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 leading-tight flex items-center">
              {doc.name}
              {/* 范式透明化标签 */}
              {showParadigmBadge && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded ml-2 font-bold border leading-none"
                  style={{
                    color: paradigm.accent,
                    borderColor: `${paradigm.accent}55`,
                    background: `${paradigm.accent}12`,
                  }}
                  title={paradigm.desc}
                >
                  {paradigm.badge}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {currentPatient ? `患者: ${currentPatient.name}${showPatientId ? ` | 住院号: ${currentPatient.id}` : ''}` : '未关联患者'}
            </p>
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      {/* 范式特定工作区 */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
