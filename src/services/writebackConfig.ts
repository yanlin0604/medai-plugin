export type WritebackMode = 'mock' | 'bs-auto' | 'bs-attached' | 'cs-auto' | 'clipboard';

export interface WritebackConfig {
  mode: WritebackMode;
  bsUrlTemplate: string;
  bsWebDriverUrl: string;
  bsDebuggerAddress: string;
  csWindowTitle: string;
}

const STORAGE_KEY = 'medaiPlugin.writebackConfig';

export const DEFAULT_WRITEBACK_CONFIG: WritebackConfig = {
  mode: 'mock',
  bsUrlTemplate:
    'file:///E:/xxxxxx/aaaaaaaaa/ai-hospitalized/demo-medical-system/bs/workspace.html?patientId={patientId}&docCode={docCode}&autologin=1',
  bsWebDriverUrl: 'http://localhost:9515',
  bsDebuggerAddress: '127.0.0.1:9222',
  csWindowTitle: '住院部病历系统（桌面版）',
};

export const WRITEBACK_MODE_LABELS: Record<WritebackMode, string> = {
  mock: '模拟回写',
  'bs-auto': 'BS网页自动填表',
  'bs-attached': 'BS附着当前页',
  'cs-auto': 'CS桌面自动填表',
  clipboard: '顺序粘贴',
};

export function getWritebackConfig(): WritebackConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WRITEBACK_CONFIG;
    return { ...DEFAULT_WRITEBACK_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WRITEBACK_CONFIG;
  }
}

export function saveWritebackConfig(config: WritebackConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resolveBsUrl(template: string, payload: { patientId: string; docCode: string }) {
  return template
    .split('{patientId}')
    .join(encodeURIComponent(payload.patientId))
    .split('{docCode}')
    .join(encodeURIComponent(payload.docCode));
}
