import { useEffect, useRef } from 'react';

/**
 * 全局快捷键 hook。用 ref 持有最新 handler，避免依赖数组导致的重复绑定。
 * 主要用于范式页快捷键提交。
 */
export function useHotkey(targetKey: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === targetKey) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targetKey]);
}
