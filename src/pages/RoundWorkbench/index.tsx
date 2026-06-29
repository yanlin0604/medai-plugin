import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Progress } from 'antd';
import {
  ArrowLeftOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  CheckOutlined,
  AudioOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useChunkedRecorder } from '../../hooks/useChunkedRecorder';

export default function RoundWorkbench() {
  const navigate = useNavigate();
  
  // 使用我们新封装的边录边传 hook，默认 15 秒（15000ms）传一次分片
  const {
    isRecording,
    isPaused,
    isFinishing,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    finishRecording,
  } = useChunkedRecorder(15000);

  const [seconds, setSeconds] = useState(0);

  // 组件挂载时立刻请求麦克风并开始录制
  useEffect(() => {
    startRecording();
  }, [startRecording]);

  // 如果遇到录音错误，抛出提示
  useEffect(() => {
    if (error) {
      message.error(`录音出现错误: ${error.message}`);
    }
  }, [error]);

  // 计时器逻辑
  useEffect(() => {
    let interval: number;
    if (isRecording && !isPaused && !isFinishing) {
      interval = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => window.clearInterval(interval);
  }, [isRecording, isPaused, isFinishing]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleFinish = async () => {
    try {
      // 调用结束方法，会自动等待最后几个切片传完并合并
      await finishRecording();
      message.success('查房结束，全区录音已上传并提交后台处理中...', 3);
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      message.error(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      // 若上传失败，可能需要提供重试或补偿逻辑
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={() => navigate('/')}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeftOutlined className="text-xl" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-wider text-[#1E3A8A]">病区查房录音</h1>
          <p className="text-xs text-slate-500 mt-1 font-semibold">支持全病区连续走查，边录边传防止数据丢失</p>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center pb-20">
        <div className="relative mb-12 flex items-center justify-center">
          {isRecording && !isPaused && !isFinishing && (
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-400/20"></div>
          )}
          <div className={`relative flex h-48 w-48 items-center justify-center rounded-full bg-gradient-to-br shadow-xl transition-all duration-500 ${
            isRecording && !isPaused && !isFinishing
              ? 'from-[#2563EB] to-[#1E3A8A] shadow-blue-500/30 scale-100' 
              : 'from-slate-300 to-slate-400 shadow-slate-400/20 scale-95'
          }`}>
            <AudioOutlined className={`text-6xl text-white ${isRecording && !isPaused && !isFinishing ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        <div className="mb-16 text-center">
          <div className="font-mono text-5xl font-bold tracking-widest text-slate-800">
            {formatTime(seconds)}
          </div>
          <div className="mt-4 text-sm font-semibold tracking-widest text-[#1E3A8A] bg-blue-50 px-4 py-1.5 rounded-full inline-block">
            {isFinishing ? '正在结束并合并录音...' : isRecording && !isPaused ? '正在录音...' : isRecording && isPaused ? '已暂停录音' : '录音未开始'}
          </div>
        </div>

        <div className="flex items-center gap-8">
          {isFinishing ? (
            <div className="flex flex-col items-center gap-4 mt-4 w-64">
              <CloudUploadOutlined className="text-4xl text-[#1E3A8A] animate-bounce" />
              <Progress percent={99} status="active" strokeColor="#1E3A8A" showInfo={false} />
              <span className="text-sm text-slate-500">正在处理最后的数据并合并...</span>
            </div>
          ) : isRecording && (
            <>
              <button
                onClick={isPaused ? resumeRecording : pauseRecording}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-[#1E3A8A]"
                title={isPaused ? "继续录音" : "暂停"}
              >
                {isPaused ? <PlayCircleOutlined className="text-2xl" /> : <PauseCircleOutlined className="text-2xl" />}
              </button>
              
              <button
                onClick={handleFinish}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1E3A8A] text-white shadow-lg transition-all hover:bg-[#172554] hover:scale-105"
                title="结束查房"
              >
                <div className="flex flex-col items-center gap-1">
                  <CheckOutlined className="text-xl" />
                  <span className="text-[10px] font-bold tracking-widest">结束查房</span>
                </div>
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
