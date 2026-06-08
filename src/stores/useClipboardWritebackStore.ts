import { create } from 'zustand';

export interface ClipboardWritebackField {
  key: string;
  label: string;
  content: string;
}

interface ClipboardWritebackState {
  isWriting: boolean;
  docName: string;
  fields: ClipboardWritebackField[];
  currentIndex: number;
  successCount: number;
  onComplete: ((successCount: number) => void) | null;

  startWriteback: (docName: string, fields: ClipboardWritebackField[]) => void;
  setOnComplete: (callback: (successCount: number) => void) => void;
  copyCurrentField: () => Promise<void>;
  nextField: () => void;
  prevField: () => void;
  cancelWriteback: () => void;
  completeWriteback: () => void;
}

const copyToClipboard = async (text: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // 降级使用文本框拷贝
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'absolute';
      textArea.style.opacity = '0';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
  } catch (err) {
    console.error('写入剪贴板失败: ', err);
  }
};

export const useClipboardWritebackStore = create<ClipboardWritebackState>((set, get) => ({
  isWriting: false,
  docName: '',
  fields: [],
  currentIndex: 0,
  successCount: 0,
  onComplete: null,

  startWriteback: (docName, fields) => {
    set({
      isWriting: true,
      docName,
      fields,
      currentIndex: 0,
      successCount: 0,
    });
    // 自动复制第一个字段
    get().copyCurrentField();
  },

  setOnComplete: (callback) => {
    set({ onComplete: callback });
  },

  copyCurrentField: async () => {
    const { fields, currentIndex } = get();
    if (fields.length > 0 && currentIndex >= 0 && currentIndex < fields.length) {
      const field = fields[currentIndex];
      await copyToClipboard(field.content);
    }
  },

  nextField: () => {
    const { currentIndex, fields, successCount } = get();
    const nextIndex = currentIndex + 1;
    const nextSuccessCount = successCount + 1;

    if (nextIndex < fields.length) {
      set({
        currentIndex: nextIndex,
        successCount: nextSuccessCount,
      });
      get().copyCurrentField();
    } else {
      // 已经完成最后一个字段的复制，正常结束
      set({ successCount: nextSuccessCount });
      get().completeWriteback();
    }
  },

  prevField: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
      get().copyCurrentField();
    }
  },

  cancelWriteback: () => {
    const { onComplete, successCount } = get();
    set({ isWriting: false });
    if (onComplete) {
      onComplete(successCount);
      set({ onComplete: null });
    }
  },

  completeWriteback: () => {
    const { onComplete, successCount } = get();
    set({ isWriting: false });
    if (onComplete) {
      onComplete(successCount);
      set({ onComplete: null });
    }
  },
}));
