import { useClipboardWritebackStore } from '../../stores/useClipboardWritebackStore';
import { ArrowLeftOutlined, ArrowRightOutlined, CopyOutlined, CloseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { message } from 'antd';

/**
 * 顺序粘贴助手悬浮面板。
 * 当 writebackConfig 中的模式为 clipboard 且触发回写时，此悬浮面板会显示在页面中央底部，
 * 协助医生逐字段把 AI 生成的内容复制并粘贴至 HIS 病历系统输入框中。
 */
export default function ClipboardWritebackAssistant() {
  const {
    isWriting,
    docName,
    fields,
    currentIndex,
    nextField,
    prevField,
    copyCurrentField,
    cancelWriteback,
  } = useClipboardWritebackStore();

  if (!isWriting || fields.length === 0) return null;

  const currentField = fields[currentIndex];
  const total = fields.length;

  const handleCopy = async () => {
    await copyCurrentField();
    message.success(`已重新复制「${currentField.label}」的内容`);
  };

  return (
    <div className="fixed top-20 right-8 z-[9999] w-[360px] bg-white/95 backdrop-blur-md border-[1.5px] border-amber-300 rounded-2xl shadow-2xl p-4 animate-fade-in transition-all">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-800">顺序粘贴助手</span>
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-semibold">
            {docName}
          </span>
        </div>
        <button
          onClick={cancelWriteback}
          className="text-slate-400 hover:text-rose-500 transition-colors p-1"
          title="取消回写"
        >
          <CloseOutlined className="text-xs" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center animate-fade-in" key={currentIndex}>
          <p className="text-[10px] text-slate-400 font-bold">当前第 {currentIndex + 1} / {total} 个字段</p>
          <h4 className="text-sm font-extrabold text-[#854D0E] mt-1">「{currentField.label}」已就绪</h4>
          <p className="text-[11px] text-amber-700 mt-1.5 leading-relaxed">
            该段已自动复制到剪贴板，请定位到目标病历系统对应的输入框中按 <kbd className="px-1 bg-amber-200/50 rounded font-semibold text-xs border border-amber-300">Ctrl+V</kbd> 粘贴。
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={prevField}
            disabled={currentIndex === 0}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 text-slate-600 rounded-lg transition-all"
          >
            <ArrowLeftOutlined className="text-[10px]" />
            <span>上一个</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1 text-[11px] font-bold px-3 py-2 bg-amber-100 hover:bg-amber-200/80 text-amber-800 rounded-lg transition-all border border-amber-200"
            title="重新复制当前字段内容"
          >
            <CopyOutlined />
          </button>

          <button
            onClick={nextField}
            className="flex-[2] flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white rounded-lg transition-all shadow-md shadow-blue-900/10 cursor-pointer animate-pulse-subtle"
          >
            <span>已粘贴，{currentIndex + 1 === total ? '完成' : '下一个'}</span>
            {currentIndex + 1 === total ? <CheckCircleOutlined className="text-[10px]" /> : <ArrowRightOutlined className="text-[10px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
