// 宿主病历系统桥接（EMR/HIS）。
//
// 本插件以侧边栏形式停靠在宿主病历系统旁，本模块是二者之间唯一的数据通道：
//   - 读取宿主系统当前选中的患者上下文
//   - 将 AI 成稿提交（回写）至宿主系统对应文书字段
//   - 监听宿主系统患者切换，用于防串户一致性校验
//
// 当前为「样例实现」，真实环境通过 Tauri 命令桥接 HIS 开放接口 / 窗口焦点抓取。
// TODO: 替换为真实接口实现（Tauri invoke / axios / event listen）。

import type { Patient, DocumentPayload, SubmitResult, PatientConsistency } from './types';

/** 样例：宿主系统当前选中的患者（真实环境从 HIS 窗口焦点读取） */
const SAMPLE_ACTIVE_PATIENT: Patient = {
  id: '10082',
  name: '张三',
  gender: '男',
  age: '65岁',
  bedNo: '1床',
  deptName: '心血管内科一病区',
  admissionDate: '2026-05-26',
  admissionDays: 3,
  doctor: '李明',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

/** 读取宿主病历系统当前活动患者；无活动患者返回 null */
export async function getActivePatient(): Promise<Patient | null> {
  // TODO: const p = await invoke<Patient>('his_get_active_patient')
  return SAMPLE_ACTIVE_PATIENT;
}

/** 宿主病历系统连接状态（医生工号 / 科室随登录态返回） */
export interface HostSession {
  online: boolean;
  doctorName: string;
  deptName: string;
}

/** 读取宿主系统登录会话 */
export async function getHostSession(): Promise<HostSession> {
  // TODO: 对接 HIS 免登服务
  return { online: true, doctorName: '李明 主治医师', deptName: '心血管内科' };
}

/**
 * 将文书成稿提交至宿主病历系统对应字段（即「回写」）。
 * 插件侧不渲染目标表单，仅负责把结构化字段与正文交给宿主系统落库。
 */
export async function submitDocument(payload: DocumentPayload): Promise<SubmitResult> {
  // TODO: await invoke('his_write_document', { payload })
  const nextMap: Record<string, string> = {
    DOC001: 'DOC002', // 入院记录 → 首次病程记录
  };
  return {
    ok: true,
    message: `「${payload.docName}」已提交至病历系统并写入对应字段`,
    nextDocCode: nextMap[payload.docCode],
  };
}

/**
 * 监听宿主系统活动患者与当前问诊患者的一致性（防串户）。
 * 真实环境订阅 HIS 患者切换事件；当宿主切换为他人时回调 consistent=false。
 * @returns 取消订阅函数
 */
export function watchPatientConsistency(
  expectedPatientId: string,
  onChange: (c: PatientConsistency) => void,
): () => void {
  // TODO: const unlisten = await listen('his://active-patient-changed', (e) => {
  //   onChange({ consistent: e.payload.id === expectedPatientId, hostPatientName: e.payload.name });
  // });
  // 样例实现：当前会话患者稳定，不触发不一致
  void expectedPatientId;
  void onChange;
  return () => {};
}
