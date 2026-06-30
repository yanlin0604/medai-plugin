import { useEffect, useMemo } from 'react';
import { message, Modal } from 'antd';
import {
  AudioOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SendOutlined,
  PlusOutlined,
  Loading3QuartersOutlined,
  SoundOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import ParadigmShell from '../ParadigmShell';
import type { ParadigmProps } from '../types';
import { usePatientStore } from '../../stores/usePatientStore';
import {
  useSurgerySession,
  SURGERY_FIELD_LABELS,
  SURGERY_FIELD_ORDER,
} from './useSurgerySession';

/** 格式化秒数为 mm:ss */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 手术记录两步流程组件。
 * Step 1: 录音口述（支持多次录音追加）
 * Step 2: 结果确认（左侧口述原文 + 右侧 AI 填充表单）
 */
export default function SurgeryFlow({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const patientIdHis = currentPatient?.id ?? '';
  const patientName = currentPatient?.name ?? '未选择患者';
  const doctor = currentPatient?.doctor ?? '医师';

  const session = useSurgerySession({
    docCode: doc.code,
    patientIdHis,
    editor: `${doctor} 医师`,
  });

  // 首次加载时拉取客观数据预填
  useEffect(() => {
    if (patientIdHis) {
      void session.loadPreFill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientIdHis]);

  const totalRecordingDuration = useMemo(
    () => session.recordings.reduce((sum, r) => sum + r.durationSeconds, 0),
    [session.recordings],
  );

  // ==================== Step 1: 录音口述 ====================

  const handleStartRecording = async () => {
    if (!patientIdHis) {
      message.warning('请先选择患者');
      return;
    }
    await session.startRecording();
  };

  const handleStopRecording = async () => {
    await session.stopRecording();
  };

  const handleGenerate = async () => {
    await session.generateFields();
  };

  // ==================== Step 2: 确认提交 ====================

  const handleSubmit = () => {
    const emptyRequired = SURGERY_FIELD_ORDER.filter(
      (key) => key !== 'assistant' && !session.fields[key]?.trim(),
    );
    if (emptyRequired.length > 0) {
      message.warning(
        `请补充以下字段：${emptyRequired.map((k) => SURGERY_FIELD_LABELS[k]).join('、')}`,
      );
      return;
    }

    Modal.confirm({
      title: '确认提交手术记录？',
      width: 380,
      okText: '确认提交',
      cancelText: '继续核对',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>
            患者 <b>{patientName}</b> 的<b>手术记录</b>将提交。
          </p>
          <p className="mt-1.5 text-amber-600">正文已由医生核对，提交后生成历史版本。</p>
        </div>
      ),
      onOk: () => {
        void session.submit();
      },
    });
  };

  return (
    <ParadigmShell doc={doc} showParadigmBadge={false} showPatientId={false}>
      <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC]">
        {/* 顶部患者信息栏 */}
        <section className="border-b border-slate-200 bg-white px-4 py-1.5 shrink-0">
          <div className="mx-auto flex max-w-[980px] items-center gap-x-3 overflow-hidden whitespace-nowrap text-[11px] leading-5 text-slate-500">
            <span className="shrink-0 font-semibold text-slate-700">{patientName}</span>
            {currentPatient && (
              <>
                <span className="shrink-0">{currentPatient.gender} {currentPatient.age}</span>
                <span className="shrink-0">住院号 {currentPatient.id}</span>
                {currentPatient.bedNo && <span className="shrink-0">{currentPatient.bedNo}床</span>}
                <span className="shrink-0">科室 {currentPatient.deptName}</span>
                <span className="shrink-0">主管 {doctor}</span>
              </>
            )}
          </div>
        </section>

        {/* 步骤指示器 */}
        <section className="border-b border-slate-200 bg-white px-4 py-2.5 shrink-0">
          <div className="mx-auto flex max-w-[980px] items-center gap-4">
            <div className={`flex items-center gap-1.5 text-xs font-bold ${session.step === 'dictation' ? 'text-[#6D28D9]' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold ${session.step === 'dictation' ? 'bg-[#6D28D9] text-white' : 'bg-slate-200 text-slate-500'}`}>1</div>
              语音口述
            </div>
            <div className="w-8 h-px bg-slate-200" />
            <div className={`flex items-center gap-1.5 text-xs font-bold ${session.step === 'review' ? 'text-[#6D28D9]' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold ${session.step === 'review' ? 'bg-[#6D28D9] text-white' : 'bg-slate-200 text-slate-500'}`}>2</div>
              确认提交
            </div>
          </div>
        </section>

        {/* 错误提示 */}
        {session.error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 shrink-0">
            {session.error}
          </div>
        )}

        {/* 主内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {session.step === 'dictation' ? (
            <DictationStep
              isRecording={session.isRecording}
              isPaused={session.isPaused}
              isFinishing={session.isFinishing}
              duration={session.duration}
              status={session.status}
              recordings={session.recordings}
              totalDuration={totalRecordingDuration}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              onPause={session.pauseRecording}
              onResume={session.resumeRecording}
              onDelete={session.deleteRecording}
              onGenerate={handleGenerate}
            />
          ) : (
            <ReviewStep
              transcriptText={session.transcriptText}
              fields={session.fields}
              status={session.status}
              onUpdateField={session.updateField}
              onSubmit={handleSubmit}
              onReset={session.reset}
            />
          )}
        </div>
      </div>
    </ParadigmShell>
  );
}

// ==================== Step 1: 录音口述 ====================

interface DictationStepProps {
  isRecording: boolean;
  isPaused: boolean;
  isFinishing: boolean;
  duration: number;
  status: string;
  recordings: Array<{ index: number; durationSeconds: number }>;
  totalDuration: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: (index: number) => void;
  onGenerate: () => void;
}

function DictationStep({
  isRecording,
  isPaused,
  isFinishing,
  duration,
  status,
  recordings,
  totalDuration,
  onStart,
  onStop,
  onPause,
  onResume,
  onDelete,
  onGenerate,
}: DictationStepProps) {
  const isTranscribing = status === 'transcribing';
  const isUploading = status === 'uploading';
  const isBusy = isRecording || isFinishing || isUploading || isTranscribing;

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="max-w-[520px] w-full text-center">
        {/* 录音按钮区 */}
        <div className="relative inline-flex items-center justify-center">
          {isRecording && (
            <div className="absolute inset-0 rounded-full bg-[#6D28D9]/20 animate-ping" style={{ animationDuration: '1.5s' }} />
          )}
          <button
            type="button"
            onClick={isRecording ? (isPaused ? onResume : onStop) : onStart}
            disabled={isFinishing || isUploading || isTranscribing}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl transition-all shadow-lg ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                : 'bg-[#6D28D9] hover:bg-[#5B21B6] shadow-[#6D28D9]/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? (
              <PauseCircleOutlined />
            ) : isUploading || isFinishing ? (
              <Loading3QuartersOutlined className="animate-spin" />
            ) : (
              <AudioOutlined />
            )}
          </button>
        </div>

        {/* 录音状态 */}
        <div className="mt-4 text-sm font-bold text-slate-700">
          {isRecording ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              录音中 {formatDuration(duration)}
              <button
                type="button"
                onClick={isPaused ? onResume : onPause}
                className="ml-2 text-xs text-slate-500 hover:text-[#6D28D9] underline"
              >
                {isPaused ? '继续' : '暂停'}
              </button>
            </span>
          ) : isUploading || isFinishing ? (
            '正在上传录音...'
          ) : isTranscribing ? (
            <span className="flex items-center justify-center gap-2">
              <Loading3QuartersOutlined className="animate-spin text-[#6D28D9]" />
              AI 正在分析口述内容...
            </span>
          ) : (
            '点击麦克风开始口述手术过程'
          )}
        </div>

        <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
          支持多次录音追加。口述完成后，AI 将自动识别并拆分为手术记录各字段。
        </p>

        {/* 已录制列表 */}
        {recordings.length > 0 && (
          <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden text-left">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">
                <SoundOutlined className="mr-1.5 text-[#6D28D9]" />
                已录制 {recordings.length} 段（共 {formatDuration(totalDuration)}）
              </span>
              {!isBusy && (
                <button
                  type="button"
                  onClick={onStart}
                  className="text-[11px] font-bold text-[#6D28D9] hover:text-[#5B21B6] flex items-center gap-1"
                >
                  <PlusOutlined className="text-[10px]" />
                  追加录音
                </button>
              )}
            </div>
            {recordings.map((r, i) => (
              <div
                key={r.index}
                className="px-4 py-2 flex items-center justify-between border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <ClockCircleOutlined className="text-slate-400" />
                  第 {i + 1} 段 · {formatDuration(r.durationSeconds)}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(r.index)}
                  disabled={isBusy}
                  className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50"
                  title="删除此段录音"
                >
                  <DeleteOutlined />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 生成按钮 */}
        {recordings.length > 0 && !isRecording && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={isBusy}
            className="mt-5 inline-flex items-center justify-center gap-2 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-bold px-8 py-3 rounded-xl transition-colors shadow-lg shadow-[#1E3A8A]/20 disabled:opacity-50"
          >
            {isTranscribing ? (
              <Loading3QuartersOutlined className="animate-spin" />
            ) : (
              <CheckCircleOutlined />
            )}
            {isTranscribing ? '正在生成...' : '开始生成手术记录'}
          </button>
        )}
      </div>
    </div>
  );
}

// ==================== Step 2: 结果确认 ====================

interface ReviewStepProps {
  transcriptText: string;
  fields: Record<string, string>;
  status: string;
  onUpdateField: (key: string, value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

function ReviewStep({
  transcriptText,
  fields,
  status,
  onUpdateField,
  onSubmit,
  onReset,
}: ReviewStepProps) {
  const isSubmitting = status === 'submitting';

  return (
    <div className="h-full flex flex-col">
      {/* 操作栏 */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 shrink-0">
        <div className="mx-auto flex max-w-[980px] items-center justify-between">
          <div className="text-xs text-slate-500">
            <FileTextOutlined className="mr-1.5 text-[#6D28D9]" />
            AI 已完成结构化分析，请核对各字段内容后提交。
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={isSubmitting}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ReloadOutlined />
              重新口述
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#1E3A8A] px-4 text-[11px] font-bold text-white hover:bg-[#172554] disabled:opacity-50"
            >
              {isSubmitting ? <Loading3QuartersOutlined className="animate-spin" /> : <SendOutlined />}
              确认提交
            </button>
          </div>
        </div>
      </div>

      {/* 左右分栏 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左侧：口述原文 */}
        <div className="w-[340px] shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-xs font-extrabold text-slate-700">
              <SoundOutlined className="mr-1.5 text-[#6D28D9]" />
              口述原文（参考）
            </h4>
            <p className="mt-1 text-[10px] text-slate-400">AI 从以下口述内容中提取了各字段信息</p>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
              {transcriptText || '（无转录文本）'}
            </div>
          </div>
        </div>

        {/* 右侧：字段表单 */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[620px] py-4 px-6">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4">
              手术记录字段
              <span className="ml-2 text-[10px] font-normal text-[#6D28D9] bg-[#6D28D9]/10 px-1.5 py-0.5 rounded">AI 自动填充</span>
            </h3>

            <div className="space-y-4">
              {SURGERY_FIELD_ORDER.map((key) => {
                const label = SURGERY_FIELD_LABELS[key];
                const value = fields[key] ?? '';
                const isLong = key === 'operationContent' || key === 'postOpDiagnosis';

                return (
                  <div key={key} className="group">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {label}
                      {key !== 'assistant' && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {isLong ? (
                      <textarea
                        value={value}
                        onChange={(e) => onUpdateField(key, e.target.value)}
                        disabled={isSubmitting}
                        rows={key === 'operationContent' ? 8 : 3}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 transition-colors focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]/30 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 resize-y"
                        placeholder={`请输入${label}`}
                      />
                    ) : (
                      <input
                        type={key === 'operationDate' ? 'date' : 'text'}
                        value={value}
                        onChange={(e) => onUpdateField(key, e.target.value)}
                        disabled={isSubmitting}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]/30 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder={`请输入${label}`}
                      />
                    )}
                    {value.trim() && (
                      <div className="mt-0.5 text-[10px] text-emerald-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        ✓ AI 已填充
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 底部提交 */}
            <div className="mt-8 pb-20 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onReset}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <ReloadOutlined />
                返回重新口述
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#172554] disabled:opacity-50 shadow-lg shadow-[#1E3A8A]/20"
              >
                {isSubmitting ? <Loading3QuartersOutlined className="animate-spin" /> : <SendOutlined />}
                确认提交手术记录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
