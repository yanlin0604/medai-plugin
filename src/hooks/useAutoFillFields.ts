/**
 * 字段自动填充 Hook
 *
 * 职责：
 * - 监听字段更新消息
 * - 自动填充空字段（不覆盖已有值）
 * - 添加 AI 填充标记样式
 * - 记录置信度信息
 */

import { useEffect, useRef } from 'react';
import { FieldExtractionService } from '../services/fieldExtractionService';

export interface UseAutoFillFieldsOptions {
  /**
   * 字段提取服务实例
   */
  service: FieldExtractionService | null;

  /**
   * 字段名映射（fieldKey -> DOM selector）
   * 如果不提供，则使用默认的 [name="{fieldKey}"] 选择器
   */
  fieldSelectors?: Record<string, string>;

  /**
   * 是否启用自动填充
   */
  enabled?: boolean;

  /**
   * 自定义填充逻辑（返回 false 则跳过该字段）
   */
  onBeforeFill?: (fieldKey: string, value: any) => boolean;

  /**
   * 填充完成回调
   */
  onAfterFill?: (fieldKey: string, value: any) => void;
}

/**
 * 字段自动填充 Hook
 */
export function useAutoFillFields(options: UseAutoFillFieldsOptions) {
  const {
    service,
    fieldSelectors = {},
    enabled = true,
    onBeforeFill,
    onAfterFill,
  } = options;

  const filledFieldsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!service || !enabled) {
      return;
    }

    // 注册字段更新回调
    const handleFieldUpdate = (fields: Record<string, any>, confidence: number) => {
      Object.entries(fields).forEach(([fieldKey, value]) => {
        // 如果用户提供了 onBeforeFill 回调，检查是否允许填充
        if (onBeforeFill && !onBeforeFill(fieldKey, value)) {
          return;
        }

        // 查找输入元素
        const selector = fieldSelectors[fieldKey] || `[name="${fieldKey}"]`;
        const inputElement = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;

        if (!inputElement) {
          console.warn(`[AutoFill] 未找到字段元素: ${fieldKey} (selector: ${selector})`);
          return;
        }

        // 只填充空字段（不覆盖已有值）
        if (!inputElement.value || inputElement.value.trim() === '') {
          // 填充值
          inputElement.value = String(value);

          // 添加 AI 填充标记
          inputElement.classList.add('ai-filled');
          inputElement.setAttribute('data-confidence', String(confidence));
          inputElement.setAttribute('data-ai-filled', 'true');

          // 触发 input 事件（让 React 感知到值的变化）
          const event = new Event('input', { bubbles: true });
          inputElement.dispatchEvent(event);

          // 记录已填充的字段
          filledFieldsRef.current.add(fieldKey);

          console.log(`[AutoFill] 字段已填充: ${fieldKey} = ${value} (confidence: ${confidence})`);

          // 调用填充完成回调
          if (onAfterFill) {
            onAfterFill(fieldKey, value);
          }
        } else {
          console.log(`[AutoFill] 跳过非空字段: ${fieldKey}`);
        }
      });
    };

    const unsubscribeFieldUpdate = service.onFieldUpdate(handleFieldUpdate);

    // 监听用户修改（移除 AI 标记）
    const handleInputChange = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.classList.contains('ai-filled')) {
        // 用户手动修改了 AI 填充的字段，移除标记
        target.classList.remove('ai-filled');
        target.removeAttribute('data-confidence');
        target.removeAttribute('data-ai-filled');
      }
    };

    // 添加全局输入监听
    document.addEventListener('input', handleInputChange);

    return () => {
      unsubscribeFieldUpdate();
      document.removeEventListener('input', handleInputChange);
    };
  }, [service, enabled, fieldSelectors, onBeforeFill, onAfterFill]);

  return {
    /**
     * 获取已填充的字段列表
     */
    getFilledFields: () => Array.from(filledFieldsRef.current),

    /**
     * 清除指定字段的 AI 标记
     */
    clearAiMark: (fieldKey: string) => {
      const selector = fieldSelectors[fieldKey] || `[name="${fieldKey}"]`;
      const inputElement = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      if (inputElement) {
        inputElement.classList.remove('ai-filled');
        inputElement.removeAttribute('data-confidence');
        inputElement.removeAttribute('data-ai-filled');
      }
    },

    /**
     * 清除所有字段的 AI 标记
     */
    clearAllAiMarks: () => {
      document.querySelectorAll('.ai-filled').forEach(element => {
        element.classList.remove('ai-filled');
        element.removeAttribute('data-confidence');
        element.removeAttribute('data-ai-filled');
      });
      filledFieldsRef.current.clear();
    },
  };
}
