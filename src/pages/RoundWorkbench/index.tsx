import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  AudioOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { usePatientStore } from '../../stores/usePatientStore';
import { getHostSession } from '../../services/emsBridge';

const ASR_WS_URL = String(import.meta.env.VITE_ASR_WS_URL ?? '').trim();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const ASR_MODE = '2';

interface AsrServerMessage {
  text?: string;
  is_final?: boolean;
  speaker?: string;
}

interface CurrentPatientState {
  name: string;
  bedNo: string;
  patientIdHis?: string;
}

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export default function RoundWorkbench() {
  const navigate = useNavigate();
  const { currentPatient: loggedPatient } = usePatientStore();
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<CurrentPatientState | null>(null);
  const [liveSubtitle, setLiveSubtitle] = useState('');
  const [doctorName, setDoctorName] = useState('医生');

  useEffect(() => {
    getHostSession().then((session) => {
      if (session && session.doctorName) {
        setDoctorName(session.doctorName);
      } else if (loggedPatient && loggedPatient.doctor) {
        setDoctorName(loggedPatient.doctor);
      }
    });
  }, [loggedPatient]);

  // Refs
  const asrWsRef = useRef<WebSocket | null>(null);
  const roundWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  const sessionIdRef = useRef<string>(`round-session-${Date.now()}`);
  const finalVoiceDraftRef = useRef('');

  // 1. 开始查房与录音（初始化 WebSocket 和麦克风采集）
  const startRoundSession = async () => {
    if (!ASR_WS_URL) {
      message.error('请配置 VITE_ASR_WS_URL 环境变量');
      return;
    }

    try {
      setIsRecording(true);
      setSeconds(0);
      setCurrentPatient(null);
      setLiveSubtitle('');
      finalVoiceDraftRef.current = '';

      // 获取麦克风裸流 (16000Hz 单声道)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 }
      });
      mediaStreamRef.current = stream;

      // 1.1 初始化与 ASR 服务的 WebSocket
      const asrWsUrl = ASR_WS_URL.includes('?') 
        ? `${ASR_WS_URL}&mode=${ASR_MODE}`
        : `${ASR_WS_URL}?mode=${ASR_MODE}`;
      const asrWs = new WebSocket(asrWsUrl);
      asrWsRef.current = asrWs;

      // 1.2 初始化与后端路由分流的 WebSocket
      const wsBase = API_BASE_URL.replace(/^http/, 'ws');
      const roundWsUrl = `${wsBase}/ws/field-extraction`;
      const roundWs = new WebSocket(roundWsUrl);
      roundWsRef.current = roundWs;

      // 建立与后端的会话交互
      roundWs.onopen = () => {
        roundWs.send(JSON.stringify({
          action: 'init_session',
          session_id: sessionIdRef.current,
          doc_code: 'DOC003',
          patient_mode: 'existing',
          pre_filled_fields: {}
        }));
      };

      roundWs.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.action === 'update_fields') {
            const patientFields = msg.patient_fields || {};
            // 检测后端推回的 patient_fields 从而高亮当前对齐患者
            if (patientFields.patientName || patientFields.bedNo) {
              setCurrentPatient({
                name: patientFields.patientName || '未知患者',
                bedNo: patientFields.bedNo || '',
                patientIdHis: patientFields.patientIdHis
              });
            }
          }
        } catch (e) {
          console.error('解析后端 WS 路由消息失败:', e);
        }
      };

      // 1.3 连接 ASR 并开启流式采集发送
      asrWs.onopen = () => {
        const AudioContextCtor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
        if (!AudioContextCtor) {
          message.error('当前浏览器不支持语音采集');
          stopSession();
          return;
        }

        const audioContext = new AudioContextCtor({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        audioContextRef.current = audioContext;
        audioSourceRef.current = source;
        audioProcessorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (asrWs.readyState !== WebSocket.OPEN) return;
          const inputData = event.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let index = 0; index < inputData.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, inputData[index]));
            pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          asrWs.send(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      asrWs.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const data = JSON.parse(event.data) as AsrServerMessage;
          if (data.text) {
            const currentSentence = data.text;
            setLiveSubtitle(currentSentence);

            // 当 ASR 段落识别结束，发送 action: text_message 给后端，让后端进行患者床位路由
            if (data.is_final) {
              const fullDraft = `${finalVoiceDraftRef.current}${currentSentence}`;
              finalVoiceDraftRef.current = fullDraft;

              if (roundWsRef.current?.readyState === WebSocket.OPEN) {
                roundWsRef.current.send(JSON.stringify({
                  action: 'text_message',
                  session_id: sessionIdRef.current,
                  text: currentSentence,
                  speaker: data.speaker || doctorName,
                  timestamp: Date.now()
                }));
              }
            }
          }
        } catch (e) {
          // 忽略非 JSON 字幕数据
        }
      };

    } catch (err) {
      setIsRecording(false);
      message.error(`无法开启录音或建立服务连接: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 2. 清理全部 WebSocket 及其麦克风资源
  const stopSession = () => {
    const processor = audioProcessorRef.current;
    audioProcessorRef.current = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }

    const source = audioSourceRef.current;
    audioSourceRef.current = null;
    source?.disconnect();

    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }

    const asrWs = asrWsRef.current;
    asrWsRef.current = null;
    if (asrWs) {
      asrWs.onopen = null;
      asrWs.onmessage = null;
      asrWs.close();
    }

    const roundWs = roundWsRef.current;
    roundWsRef.current = null;
    if (roundWs) {
      roundWs.onopen = null;
      roundWs.onmessage = null;
      roundWs.close();
    }

    setIsRecording(false);
  };

  // 组件挂载时立刻请求麦克风并开始录制
  useEffect(() => {
    void startRoundSession();
    return () => {
      stopSession();
    };
  }, []);

  // 计时器逻辑
  useEffect(() => {
    let interval: number;
    if (isRecording && !isFinishing) {
      interval = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => window.clearInterval(interval);
  }, [isRecording, isFinishing]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 3. 结束查房
  const handleFinish = async () => {
    setIsFinishing(true);
    message.loading({ content: '正在同步查房记录并提取草稿...', key: 'finish-round' });
    try {
      // 3.1 向后端 WebSocket 发送关闭会话请求，触发文书要素自动存盘
      if (roundWsRef.current?.readyState === WebSocket.OPEN) {
        roundWsRef.current.send(JSON.stringify({
          action: 'close_session',
          session_id: sessionIdRef.current
        }));
      }

      // 3.2 延迟断开连接以保证最后的数据完全写回
      setTimeout(() => {
        stopSession();
        message.success({ content: '查房结束，病历草稿已成功提炼！', key: 'finish-round', duration: 2 });
        navigate('/');
      }, 1500);

    } catch (err) {
      setIsFinishing(false);
      message.error(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={() => {
            stopSession();
            navigate('/');
          }}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="返回首页"
        >
          <ArrowLeftOutlined className="text-xl" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-wider text-[#1E3A8A]">病区查房录音</h1>
          <p className="text-xs text-slate-500 mt-1 font-semibold">支持全病区连续走查，语音实时分诊路由</p>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-between pb-10 pt-8 px-6">
        {/* 中间高亮显示区域 - 🩺 正在查房：X床 - 姓名 */}
        <div className="w-full max-w-sm shrink-0">
          {currentPatient ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-[#1E3A8A] px-6 py-5 text-white shadow-xl shadow-blue-500/10 border border-blue-400/20 transform scale-100 transition-all duration-500">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200">🩺 当前对齐患者</span>
              <h2 className="mt-2 text-2xl font-extrabold tracking-wider">
                {currentPatient.bedNo ? `${currentPatient.bedNo}床 - ` : ''}{currentPatient.name}
              </h2>
              <p className="mt-1.5 text-xs text-blue-100 font-medium">后续语音记录将写入此患者日常病程</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 border-dashed bg-white/50 px-6 py-5 text-slate-400 transform scale-98 transition-all duration-300">
              <LoadingOutlined className="text-xl text-blue-500 animate-spin" />
              <span className="mt-2 text-xs font-semibold tracking-wide text-slate-500">
                等待说出患者床号或姓名...
              </span>
              <p className="mt-1 text-[10px] text-slate-400">例: “来看下12床张三...”</p>
            </div>
          )}
        </div>

        {/* 麦克风录音动画与时间 */}
        <div className="flex flex-col items-center justify-center my-6">
          <div className="relative mb-8 flex items-center justify-center">
            {isRecording && !isFinishing && (
              <div className="absolute inset-0 animate-ping rounded-full bg-blue-400/20"></div>
            )}
            <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br shadow-xl transition-all duration-500 ${
              isRecording && !isFinishing
                ? 'from-[#2563EB] to-[#1E3A8A] shadow-blue-500/30 scale-100' 
                : 'from-slate-300 to-slate-400 shadow-slate-400/20 scale-95'
            }`}>
              <AudioOutlined className={`text-5xl text-white ${isRecording && !isFinishing ? 'animate-pulse' : ''}`} />
            </div>
          </div>

          <div className="text-center">
            <div className="font-mono text-4xl font-bold tracking-widest text-slate-800">
              {formatTime(seconds)}
            </div>
            <div className="mt-3 text-xs font-semibold tracking-widest text-[#1E3A8A] bg-blue-50 px-4 py-1 rounded-full inline-block">
              {isFinishing ? '正在整理查房意见...' : '正在录制中'}
            </div>
          </div>
        </div>

        {/* 字幕微流显示区 */}
        <div className="w-full max-w-md bg-slate-800/80 rounded-xl px-4 py-3 text-center min-h-[50px] flex items-center justify-center backdrop-blur-sm border border-slate-700/50 shadow-md">
          {liveSubtitle ? (
            <p className="text-xs text-white leading-relaxed font-medium animate-fadeIn">
              {liveSubtitle}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">
              查房发言实时字幕将在此呈现
            </p>
          )}
        </div>

        {/* 结束查房按钮 */}
        <div className="flex items-center justify-center shrink-0 w-full mt-4">
          <button
            onClick={handleFinish}
            disabled={isFinishing || !isRecording}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1E3A8A] text-white shadow-lg transition-all hover:bg-[#172554] hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            title="结束查房"
            aria-label="结束查房"
          >
            <div className="flex flex-col items-center gap-0.5">
              <CheckOutlined className="text-lg" />
              <span className="text-[9px] font-bold tracking-widest">结束</span>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
}
