import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import appIcon from '../../../src-tauri/icons/app-icon-64.png';
import { expandAssistantWindow } from '../../services/windowMode';
import { BubbleEmrContext, useBubbleStore, getBubbleContextKey } from '../../stores/useBubbleStore';
import { usePatientStore } from '../../stores/usePatientStore';
import { watchEmrContext } from '../../services/emrContext/watchEmrContext';
import { getDocByCode } from '../../config/docRegistry';

interface BubbleShellProps {
  onExpand?: (context: BubbleEmrContext | null) => void;
}

export default function BubbleShell({ onExpand }: BubbleShellProps) {
  const navigate = useNavigate();
  const { mode, detectedContext, expand, setDetectedContext, markActivated, hasActivated } = useBubbleStore();
  const { selectPatient, selectDoc } = usePatientStore();
  const isDetected = mode === 'detected' && Boolean(detectedContext);

  // 监听 EMR 上下文变化，只更新气泡状态，不自动展开
  useEffect(() => {
    const cleanup = watchEmrContext((context) => {
      setDetectedContext(context);
    });

    return cleanup;
  }, [setDetectedContext]);

  const handleExpand = () => {
    // 如果是检测态气泡，需要关联患者与文书
    if (isDetected && detectedContext) {
      const contextKey = getBubbleContextKey(detectedContext);

      // 避免重复激活同一上下文
      if (!hasActivated(contextKey)) {
        // 从 EMR 上下文构建患者对象
        const patient = {
          id: detectedContext.patientId,
          name: detectedContext.patientName,
          gender: '未知',
          age: '未知',
          bedNo: '未知',
          deptName: '未知',
          admissionDate: new Date().toISOString().split('T')[0],
          admissionDays: 0,
          doctor: '未知',
          diagnosis: '待完善',
        };

        // 关联患者
        selectPatient(patient);

        // 选择 DOC010 文书
        const doc = getDocByCode(detectedContext.docCode);
        if (doc) {
          selectDoc(doc);
        }

        // 标记已激活
        markActivated(contextKey);

        // 导航到文书工作区
        navigate(`/doc/${detectedContext.docCode}`);
      }
    }

    // 展开窗口
    expand(detectedContext);
    void expandAssistantWindow();
    onExpand?.(detectedContext);
  };

  return (
    <button
      type="button"
      data-tauri-drag-region
      onClick={handleExpand}
      className={[
        'flex items-center gap-2 px-3 py-2 w-full h-full',
        'bg-white border shadow-lg',
        'hover:shadow-xl transition-shadow duration-200',
        'outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        isDetected
          ? 'border-emerald-500 focus-visible:ring-emerald-400'
          : 'border-[#1E3A8A] focus-visible:ring-[#1E3A8A]',
      ].join(' ')}
      style={{ cursor: 'move' }}
    >
      {/* 图标 */}
      <div
        className={[
          'relative flex items-center justify-center w-9 h-9 shrink-0',
          isDetected ? 'bg-emerald-50' : 'bg-[#F0F5FF]',
        ].join(' ')}
      >
        {isDetected ? (
          <FileTextOutlined className="text-base text-emerald-600" />
        ) : (
          <img src={appIcon} alt="" className="w-5 h-5 object-contain" draggable={false} />
        )}
        {/* 状态点 */}
        <span
          className={[
            'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm',
            isDetected ? 'bg-emerald-500' : 'bg-[#1E3A8A]',
          ].join(' ')}
        />
      </div>

      {/* 文字 */}
      <div className="flex-1 min-w-0 text-left">
        {isDetected && detectedContext ? (
          <>
            <div className="text-[10px] font-bold text-emerald-700 truncate">
              {detectedContext.patientName}
            </div>
            <div className="text-[9px] font-medium text-slate-500 truncate">
              出院记录
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1 text-[11px] font-bold text-[#1E3A8A]">
            <SearchOutlined className="text-sm" />
            病历助手
          </div>
        )}
      </div>

      {/* 箭头图标 */}
      <div
        className={[
          'flex items-center justify-center w-7 h-7 shrink-0',
          'transition-transform hover:scale-110',
          isDetected ? 'bg-emerald-600 text-white' : 'bg-[#1E3A8A] text-white',
        ].join(' ')}
      >
        <ArrowRightOutlined className="text-xs" />
      </div>
    </button>
  );
}
