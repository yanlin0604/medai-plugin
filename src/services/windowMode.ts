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
  assist: { width: 360, height: 310 },
  panel: { width: 480, height: 820 },
} satisfies Record<'bubble' | 'assist' | 'panel', AssistantWindowSize>;

const WINDOW_MARGIN = 16;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

async function getCurrentWorkArea(appWindow: TauriWindow) {
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  if (!monitor) {
    return null;
  }

  const scaleFactor = monitor.scaleFactor || (await appWindow.scaleFactor());
  return {
    position: monitor.workArea.position.toLogical(scaleFactor),
    size: monitor.workArea.size.toLogical(scaleFactor),
  };
}

async function moveToBottomRight(appWindow: TauriWindow, size: AssistantWindowSize) {
  const workArea = await getCurrentWorkArea(appWindow);
  if (!workArea) {
    return;
  }

  // 收起后固定悬浮在屏幕可视区域右下角
  const x = workArea.position.x + workArea.size.width - size.width - WINDOW_MARGIN;
  const y = workArea.position.y + workArea.size.height - size.height - WINDOW_MARGIN;

  await appWindow.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
}

async function applyRightDockedPanel(appWindow: TauriWindow, width: number) {
  const workArea = await getCurrentWorkArea(appWindow);
  if (!workArea) {
    await appWindow.setSize(new LogicalSize(width, ASSISTANT_WINDOW_SIZES.panel.height));
    return;
  }

  // 展开后靠右停靠，高度适配屏幕可视区域，宽度保持不变
  const height = Math.max(1, Math.round(workArea.size.height));
  const x = workArea.position.x + workArea.size.width - width;
  const y = workArea.position.y;

  await appWindow.setSize(new LogicalSize(width, height));
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
    if (isBubble) {
      await appWindow.setSize(new LogicalSize(size.width, size.height));
      await moveToBottomRight(appWindow, size);
    } else {
      await applyRightDockedPanel(appWindow, size.width);
    }
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

export function showAssistBubbleWindow() {
  return applyAssistantWindowSize(ASSISTANT_WINDOW_SIZES.assist, false, true);
}
