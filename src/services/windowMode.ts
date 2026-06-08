import {
  getCurrentWindow,
  currentMonitor,
  primaryMonitor,
  LogicalPosition,
  LogicalSize,
  type Window as TauriWindow,
} from '@tauri-apps/api/window';

export interface AssistantWindowSize {
  width: number;
  height: number;
}

export const ASSISTANT_WINDOW_SIZES = {
  bubble: { width: 236, height: 68 },
  panel: { width: 480, height: 820 },
} satisfies Record<'bubble' | 'panel', AssistantWindowSize>;

const WINDOW_MARGIN = 16;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

async function moveToBottomRight(appWindow: TauriWindow, size: AssistantWindowSize) {
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  if (!monitor) {
    return;
  }

  const scaleFactor = monitor.scaleFactor || (await appWindow.scaleFactor());
  const workAreaPosition = monitor.workArea.position.toLogical(scaleFactor);
  const workAreaSize = monitor.workArea.size.toLogical(scaleFactor);

  // 固定在右下角
  const x = workAreaPosition.x + workAreaSize.width - size.width - WINDOW_MARGIN;
  const y = workAreaPosition.y + workAreaSize.height - size.height - WINDOW_MARGIN;

  await appWindow.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
}

async function applyAssistantWindowSize(size: AssistantWindowSize, shouldFocus: boolean, isBubble: boolean) {
  if (!isTauriRuntime()) {
    return false;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.unmaximize().catch(() => undefined);

    // 设置窗口属性
    await appWindow.setResizable(!isBubble);
    await appWindow.setAlwaysOnTop(isBubble);

    // 设置尺寸和位置
    await appWindow.setSize(new LogicalSize(size.width, size.height));
    await moveToBottomRight(appWindow, size);
    await appWindow.show().catch(() => undefined);

    if (shouldFocus) {
      await appWindow.setFocus().catch(() => undefined);
    }

    return true;
  } catch (error) {
    console.warn('切换助手窗口尺寸失败', error);
    return false;
  }
}

export function expandAssistantWindow() {
  return applyAssistantWindowSize(ASSISTANT_WINDOW_SIZES.panel, true, false);
}

export function collapseAssistantWindow() {
  return applyAssistantWindowSize(ASSISTANT_WINDOW_SIZES.bubble, false, true);
}
