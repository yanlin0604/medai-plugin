export const WRITEBACK_MODE_LABEL = 'BS演示系统直写';

export const BS_WORKSPACE_URL_TEMPLATE =
  'file:///E:/2025-zl/demo-medical-system/bs/workspace.html?patientId={patientId}&docCode={docCode}&autologin=1';

export function resolveBsUrl(payload: { patientId: string; docCode: string }) {
  return BS_WORKSPACE_URL_TEMPLATE
    .split('{patientId}')
    .join(encodeURIComponent(payload.patientId))
    .split('{docCode}')
    .join(encodeURIComponent(payload.docCode));
}
