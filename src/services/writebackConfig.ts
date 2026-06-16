export const WRITEBACK_MODE_LABEL = 'BS/CS演示系统直写';

export const BS_WORKSPACE_URL_TEMPLATE =
  'file:///E:/xxxxxx/aaaaaaaaa/ai-hospitalized/demo-medical-system/bs/workspace.html?patientId={patientId}&docCode={docCode}&autologin=1';

export const CS_WORKSPACE_URL_TEMPLATE =
  'http://127.0.0.1:5175?patientId={patientId}&docCode={docCode}';

export function resolveBsUrl(payload: { patientId: string; docCode: string }) {
  return BS_WORKSPACE_URL_TEMPLATE
    .split('{patientId}')
    .join(encodeURIComponent(payload.patientId))
    .split('{docCode}')
    .join(encodeURIComponent(payload.docCode));
}

export function resolveCsUrl(payload: { patientId: string; docCode: string }) {
  return CS_WORKSPACE_URL_TEMPLATE
    .split('{patientId}')
    .join(encodeURIComponent(payload.patientId))
    .split('{docCode}')
    .join(encodeURIComponent(payload.docCode));
}

/**
 * 根据 source 解析工作区 URL
 */
export function resolveWorkspaceUrl(source: string, payload: { patientId: string; docCode: string }) {
  if (source === 'demo-cs') {
    return resolveCsUrl(payload);
  }
  return resolveBsUrl(payload);
}

