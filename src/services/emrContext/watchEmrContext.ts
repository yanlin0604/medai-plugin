import { inspectCurrentEmrContext } from './demoBsDetector';
import { getEmrContextKey, type EmrContext, type EmrContextDebug } from './types';

export type EmrContextChangeHandler = (context: EmrContext | null) => void;
export type EmrContextDebugHandler = (debug: EmrContextDebug) => void;

export interface WatchEmrContextOptions {
  intervalMs?: number;
  immediate?: boolean;
  onDebug?: EmrContextDebugHandler;
}

export const DEFAULT_EMR_CONTEXT_POLL_INTERVAL_MS = 1500;
const MIN_EMR_CONTEXT_POLL_INTERVAL_MS = 800;

export function watchEmrContext(
  onChange: EmrContextChangeHandler,
  options: WatchEmrContextOptions = {},
) {
  const intervalMs = Math.max(
    options.intervalMs ?? DEFAULT_EMR_CONTEXT_POLL_INTERVAL_MS,
    MIN_EMR_CONTEXT_POLL_INTERVAL_MS,
  );
  let disposed = false;
  let initialized = false;
  let lastContextKey: string | null = null;
  let polling = false;

  const poll = async () => {
    if (disposed || polling) {
      return;
    }

    polling = true;
    try {
      const debug = await inspectCurrentEmrContext();
      if (disposed) {
        return;
      }

      options.onDebug?.(debug);
      const context = debug.status === 'accepted' ? debug.context : null;
      const nextContextKey = context ? getEmrContextKey(context) : null;
      if (!initialized) {
        initialized = true;
        lastContextKey = nextContextKey;
        onChange(context);
        return;
      }

      if (nextContextKey !== lastContextKey) {
        lastContextKey = nextContextKey;
        onChange(context);
      }
    } catch (error) {
      console.warn('轮询 EMR 上下文失败', error);
    } finally {
      polling = false;
    }
  };

  if (options.immediate !== false) {
    void poll();
  }

  const timer = setInterval(() => {
    void poll();
  }, intervalMs);

  return () => {
    disposed = true;
    clearInterval(timer);
  };
}
