import { useState } from 'react';
import { message } from 'antd';
import { AudioOutlined } from '@ant-design/icons';

interface Props {
  title?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 点击麦克风模拟语音转写追加的内容 */
  mockTranscript?: string;
}

/**
 * 口述补录面板（范式二：术后/抢救后医生语音口述主观细节）。
 * 麦克风模拟"语音实时转文字"，对应需求图3-6"口述补录面板"。
 */
export default function DictationConsole({ title, value, onChange, placeholder, mockTranscript }: Props) {
  const [recording, setRecording] = useState(false);

  const handleMic = () => {
    if (recording) {
      setRecording(false);
      message.info('已暂停口述采集');
      return;
    }
    setRecording(true);
    message.loading({ content: '正在采集医生口述语音...', key: 'dict' });
    setTimeout(() => {
      setRecording(false);
      if (mockTranscript) onChange(value ? `${value}${mockTranscript}` : mockTranscript);
      message.success({ content: '语音转写已追加至口述区', key: 'dict', duration: 1.5 });
    }, 1500);
  };

  return (
    <div className="bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 flex flex-col items-center gap-2.5">
      <div className="w-full flex justify-between text-xs font-bold text-slate-700">
        <span>{title ?? '🎙️ 医生口述主观细节'}</span>
        <span className="text-emerald-600">语音实时转文字</span>
      </div>

      <button
        onClick={handleMic}
        title="点击开始口述"
        className={`w-[50px] h-[50px] rounded-full flex items-center justify-center border border-dashed transition-all ${
          recording
            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] animate-pulse scale-105'
            : 'bg-[#F0F5FF] text-[#1E3A8A] border-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white hover:scale-105'
        }`}
      >
        <AudioOutlined className="text-lg" />
      </button>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '语音转写文字将显示于此，亦可手动补充...'}
        className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs text-slate-800 h-[60px] resize-none outline-none focus:border-[#1E3A8A] transition-colors leading-relaxed"
      />
    </div>
  );
}
