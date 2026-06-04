import { useState, useRef, useEffect } from 'react';
import { message } from 'antd';

interface Props {
  /** 结束录音并进入治理（跳转下一步） */
  onFinish: () => void;
}

const BARS = [6, 10, 16, 12, 8, 18, 14, 4];

/**
 * 录音控制台（范式三：床旁问诊连续录音 + 动态波形 + 计时器）。
 * 录音中实时呈现方言自适应识别状态（ASR 能力，无需人工干预）。
 */
export default function RecorderConsole({ onFinish }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const start = () => {
    setRecording(true);
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stop = () => {
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
    message.success('录音结束，正在脱敏敏感信息并提取关键要素…');
    onFinish();
  };

  return (
    <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-3">
      <span className="font-mono text-xl font-bold text-slate-800">{fmt(seconds)}</span>
      <div className="flex items-center gap-[3px] h-6">
        {BARS.map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-[1px]"
            style={
              recording
                ? { animation: `record-bounce 1s ${i * 0.12}s infinite alternate`, background: '#1E3A8A' }
                : { height: h, background: '#CBD5E1' }
            }
          />
        ))}
      </div>
      {!recording ? (
        <button onClick={start} className="px-4 py-2 rounded-full text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors">
          ▶ 开始床旁问诊录音
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2 w-full">
          <button onClick={stop} className="px-4 py-2 rounded-full text-xs font-bold bg-[#EF4444] hover:bg-rose-600 text-white transition-colors">
            ⏹ 结束问诊并整理
          </button>
          <span className="text-[10px] text-emerald-600 font-medium">● 方言自适应识别已启用</span>
        </div>
      )}
    </div>
  );
}
