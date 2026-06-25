/**
 * 识别文本显示组件
 *
 * 职责：
 * - 显示实时识别的文本
 * - 区分不同说话人
 * - 自动滚动到最新内容
 */

import React, { useEffect, useRef } from 'react';

export interface TranscriptItem {
  speaker: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface TranscriptDisplayProps {
  /**
   * 识别文本列表
   */
  transcripts: TranscriptItem[];

  /**
   * 是否显示说话人标识
   */
  showSpeaker?: boolean;

  /**
   * 是否自动滚动到最新
   */
  autoScroll?: boolean;

  /**
   * 最大高度
   */
  maxHeight?: string;

  /**
   * 自定义样式类名
   */
  className?: string;
}

/**
 * 识别文本显示组件
 */
export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  showSpeaker = true,
  autoScroll = true,
  maxHeight = '400px',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcripts, autoScroll]);

  // 格式化时间戳
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 获取说话人颜色
  const getSpeakerColor = (speaker: string): string => {
    // 简单的颜色映射
    const colors: Record<string, string> = {
      '用户1': '#3b82f6', // 蓝色
      '用户2': '#10b981', // 绿色
      '未知': '#6b7280',  // 灰色
    };
    return colors[speaker] || '#8b5cf6'; // 默认紫色
  };

  return (
    <div
      ref={containerRef}
      className={`transcript-display ${className}`}
      style={{
        maxHeight,
        overflowY: 'auto',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}
    >
      {transcripts.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: '#9ca3af',
            padding: '20px',
            fontSize: '14px',
          }}
        >
          等待识别文本...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {transcripts.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '6px',
                borderLeft: `3px solid ${getSpeakerColor(item.speaker)}`,
                opacity: item.isFinal ? 1 : 0.6,
              }}
            >
              {showSpeaker && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: getSpeakerColor(item.speaker),
                    }}
                  >
                    {item.speaker}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                    }}
                  >
                    {formatTime(item.timestamp)}
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: '14px',
                  color: '#374151',
                  lineHeight: '1.5',
                }}
              >
                {item.text}
                {!item.isFinal && (
                  <span
                    style={{
                      marginLeft: '4px',
                      color: '#9ca3af',
                      fontSize: '12px',
                    }}
                  >
                    (识别中...)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TranscriptDisplay;
