import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadSingleChunk, mergeChunks, type UploadResult } from '../services/chunkUpload';

export function useChunkedRecorder(timesliceMs = 15000) { // 默认15秒一个分片
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载时自动清理资源，防止退出页面后继续在后台录制并发送网络分片请求
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        // 解绑回调，防止继续触发后台的 Promise 队列上传及合并调用
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop();
          } catch (e) {
            console.error('卸载时停止录音失败', e);
          }
        }
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.error('卸载时释放音频流轨道失败', e);
        }
        streamRef.current = null;
      }
    };
  }, []);

  // 记录上传的元数据
  const uploadIdRef = useRef<string | null>(null);
  const fileNameRef = useRef<string | null>(null);
  const chunkIndexRef = useRef<number>(0);

  // 用一个队列来保证分片上传的顺序，防止网络波动导致乱序或并发爆炸
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  
  // 最终的 resolver，等全部结束时触发
  const finishPromiseRef = useRef<{ resolve: (val: UploadResult) => void; reject: (err: Error) => void } | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const uploadId = crypto.randomUUID();
      const fileName = `round_record_${new Date().getTime()}.webm`; // 浏览器录制多为 webm 格式
      
      uploadIdRef.current = uploadId;
      fileNameRef.current = fileName;
      chunkIndexRef.current = 0;
      uploadQueueRef.current = Promise.resolve(); // 重置队列

      // 选择一个通用的音频格式
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
        
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const currentIndex = chunkIndexRef.current++;
          const chunkBlob = event.data;

          // 将上传任务加入队列串行执行，确保顺序和服务器压力可控
          uploadQueueRef.current = uploadQueueRef.current.then(async () => {
            try {
              await uploadSingleChunk(uploadId, currentIndex, chunkBlob, fileName);
            } catch (err) {
              console.error(`分片 ${currentIndex} 上传失败`, err);
              setError(err instanceof Error ? err : new Error(String(err)));
            }
          });
        }
      };

      recorder.onstop = () => {
        // 当 stop 被调用后，MediaRecorder 会立刻抛出最后一次 ondataavailable，之后进入这里
        // 此时我们等待上传队列执行完毕，再调用 merge
        uploadQueueRef.current.then(async () => {
          if (!uploadIdRef.current || !fileNameRef.current || !finishPromiseRef.current) return;
          try {
            const result = await mergeChunks(
              uploadIdRef.current,
              fileNameRef.current,
              chunkIndexRef.current
            );
            finishPromiseRef.current.resolve(result);
          } catch (err) {
            finishPromiseRef.current.reject(err instanceof Error ? err : new Error(String(err)));
          } finally {
            // 清理
            uploadIdRef.current = null;
            fileNameRef.current = null;
            finishPromiseRef.current = null;
            chunkIndexRef.current = 0;
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
          }
        });
      };

      recorder.start(timesliceMs);
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      setDuration(0);
      durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('无法访问麦克风'));
    }
  }, [timesliceMs]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const finishRecording = useCallback((): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        return reject(new Error('没有正在进行的录音'));
      }
      setIsFinishing(true);
      setIsRecording(false);
      setIsPaused(false);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      finishPromiseRef.current = { resolve, reject };
      
      // 停止录制触发最后一次数据吐出和 onstop
      mediaRecorderRef.current.stop();
    });
  }, []);

  return {
    isRecording,
    isPaused,
    isFinishing,
    error,
    duration,
    startRecording,
    pauseRecording,
    resumeRecording,
    finishRecording,
  };
}
