/**
 * 字段提取功能使用示例
 *
 * 展示如何在入院记录表单中集成实时字段提取功能
 */

import React, { useEffect, useState } from 'react';
import { FieldExtractionService } from '../services/fieldExtractionService';
import { useAutoFillFields } from '../hooks/useAutoFillFields';
import TranscriptDisplay, { TranscriptItem } from '../components/TranscriptDisplay';
import '../assets/styles/fieldExtraction.css';

export interface FieldExtractionExampleProps {
  sessionId: string;
  docCode: string;
  patientId: number;
  preFilledFields?: Record<string, any>;
}

/**
 * 字段提取功能使用示例
 */
export const FieldExtractionExample: React.FC<FieldExtractionExampleProps> = ({
  sessionId,
  docCode,
  patientId,
  preFilledFields,
}) => {
  const [service, setService] = useState<FieldExtractionService | null>(null);
  const [transcripts] = useState<TranscriptItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用字段自动填充 Hook
  const { clearAllAiMarks } = useAutoFillFields({
    service,
    enabled: true,
    onBeforeFill: (fieldKey, value) => {
      console.log(`准备填充字段: ${fieldKey} = ${value}`);
      return true; // 允许填充
    },
    onAfterFill: (fieldKey, value) => {
      console.log(`字段已填充: ${fieldKey} = ${value}`);
    },
  });

  // 初始化连接
  useEffect(() => {
    const fieldExtractionService = new FieldExtractionService({
      sessionId,
      docCode,
      patientId,
      preFilledFields,
      patientMode: 'existing',
      webSocketUrl: import.meta.env.VITE_FIELD_EXTRACTION_WS_URL,
    });

    // 注册错误回调
    fieldExtractionService.onError((errorMessage) => {
      setError(errorMessage);
    });

    // 连接
    fieldExtractionService.connect()
      .then(() => {
        setService(fieldExtractionService);
        setIsConnected(true);
        console.log('字段提取服务已连接');
      })
      .catch((err) => {
        console.error('连接失败:', err);
        setError('连接失败');
      });

    // 清理
    return () => {
      fieldExtractionService.disconnect();
    };
  }, [sessionId, docCode, patientId, preFilledFields]);

  // 清除所有 AI 标记
  const handleClearMarks = () => {
    clearAllAiMarks();
    console.log('已清除所有 AI 标记');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>实时字段提取示例</h2>

      {/* 连接状态 */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontWeight: 'bold' }}>连接状态：</span>
        <span style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
          {isConnected ? '已连接' : '未连接'}
        </span>
        {error && (
          <span style={{ marginLeft: '10px', color: '#ef4444' }}>
            错误: {error}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* 左侧：表单 */}
        <div>
          <h3>入院记录表单</h3>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label>患者姓名：</label>
              <input
                type="text"
                name="patient_name"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label>年龄：</label>
              <input
                type="text"
                name="age"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label>年龄单位：</label>
              <input
                type="text"
                name="age_unit"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label>主诉：</label>
              <textarea
                name="chief_complaint"
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label>现病史：</label>
              <textarea
                name="present_illness"
                rows={5}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleClearMarks}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              清除所有 AI 标记
            </button>
          </form>

          <div style={{ marginTop: '16px', fontSize: '12px', color: '#6b7280' }}>
            <p>💡 提示：</p>
            <ul>
              <li>AI 自动填充的字段会显示淡黄色背景和蓝色左边框</li>
              <li>聚焦字段时背景会消失</li>
              <li>手动修改后 AI 标记会自动移除</li>
            </ul>
          </div>
        </div>

        {/* 右侧：识别文本 */}
        <div>
          <h3>识别文本</h3>
          <TranscriptDisplay
            transcripts={transcripts}
            showSpeaker={true}
            autoScroll={true}
            maxHeight="600px"
          />
        </div>
      </div>
    </div>
  );
};

export default FieldExtractionExample;
