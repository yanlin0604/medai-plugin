import type { AsrServerMessage, BrowserAsrSessionOptions, StopAsrOptions } from './types';

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const DEFAULT_ASR_MODE = '2';
const AUDIO_SAMPLE_RATE = 16000;
const PROCESSOR_BUFFER_SIZE = 4096;

export function buildAsrWsUrl(baseUrl: string, mode = DEFAULT_ASR_MODE) {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}mode=${encodeURIComponent(mode)}`;
}

export class BrowserAsrSession {
  private readonly options: BrowserAsrSessionOptions;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private stopped = false;

  constructor(options: BrowserAsrSessionOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (!this.options.websocketUrl.trim()) {
      throw new Error('请先配置 ASR WebSocket 地址。');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风采集。');
    }

    this.stopped = false;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: AUDIO_SAMPLE_RATE },
    });
    this.mediaStream = stream;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(buildAsrWsUrl(this.options.websocketUrl, this.options.mode));
      this.ws = ws;

      ws.onopen = () => {
        if (this.stopped) {
          ws.close();
          resolve();
          return;
        }

        try {
          this.startAudioPipeline(stream, ws);
          this.options.onOpen?.();
          resolve();
        } catch (error) {
          this.stop({ sendFlush: false });
          reject(error instanceof Error ? error : new Error('语音采集初始化失败。'));
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const message = this.parseAsrMessage(event.data);
        if (!message) return;
        if (message.is_final === false) {
          this.options.onPartial?.(message);
        } else {
          this.options.onFinal?.(message);
        }
      };

      ws.onerror = () => {
        const error = new Error('语音识别连接异常，请检查 ASR 服务。');
        this.options.onError?.(error);
        reject(error);
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.releaseAudio();
        this.options.onClose?.();
      };
    });
  }

  stop(options: StopAsrOptions = {}): void {
    const { sendFlush = true } = options;
    this.stopped = true;
    this.releaseAudio();

    const ws = this.ws;
    this.ws = null;
    if (!ws) return;

    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;

    if (ws.readyState === WebSocket.OPEN) {
      if (sendFlush) ws.send('flush');
      ws.close();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  private startAudioPipeline(stream: MediaStream, ws: WebSocket): void {
    const AudioContextCtor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('当前浏览器不支持语音采集。');
    }

    const audioContext = new AudioContextCtor({ sampleRate: AUDIO_SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);

    this.audioContext = audioContext;
    this.audioSource = source;
    this.audioProcessor = processor;

    processor.onaudioprocess = (audioEvent) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const inputData = audioEvent.inputBuffer.getChannelData(0);
      ws.send(convertFloat32ToPcm16(inputData).buffer);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }

  private releaseAudio(): void {
    const processor = this.audioProcessor;
    this.audioProcessor = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }

    const source = this.audioSource;
    this.audioSource = null;
    source?.disconnect();

    const stream = this.mediaStream;
    this.mediaStream = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = this.audioContext;
    this.audioContext = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }
  }

  private parseAsrMessage(data: string): AsrServerMessage | null {
    try {
      return JSON.parse(data) as AsrServerMessage;
    } catch {
      return null;
    }
  }
}

function convertFloat32ToPcm16(inputData: Float32Array): Int16Array {
  const pcm16 = new Int16Array(inputData.length);
  for (let index = 0; index < inputData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, inputData[index]));
    pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return pcm16;
}
