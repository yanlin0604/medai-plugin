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
import { invoke } from '@tauri-apps/api/core';
import { WRITEBACK_MODE_LABEL, resolveBsUrl } from './writebackConfig';

interface WritebackStats {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ fieldKey: string; message: string }>;
}

const isTauriRuntime = () =>
  typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

/** 样例：宿主系统当前选中的患者（真实环境从 HIS 窗口焦点读取） */
const SAMPLE_ACTIVE_PATIENT: Patient = {
  id: 'ZY20260001',
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bedNo: '1201',
  deptName: '心血管内科',
  admissionDate: '2026-06-01',
  admissionDays: 4,
  doctor: '林志远',
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
  return { online: true, doctorName: '林志远 主治医师', deptName: '心血管内科' };
}

/**
 * 将文书成稿提交至宿主病历系统对应字段（即「回写」）。
 * 插件侧不渲染目标表单，仅负责把结构化字段与正文交给宿主系统落库。
 */
export async function submitDocument(payload: DocumentPayload): Promise<SubmitResult> {
  const nextMap: Record<string, string> = {
    DOC001: 'DOC002', // 入院记录 → 首次病程记录
  };

  try {
    const stats = await executeWriteback(payload);

    const ok = stats.failed === 0;
    return {
      ok,
      message: ok
        ? `「${payload.docName}」${WRITEBACK_MODE_LABEL}完成：${stats.success}/${stats.total} 个字段已写入`
        : `「${payload.docName}」${WRITEBACK_MODE_LABEL}部分失败：${stats.success}/${stats.total} 个字段成功`,
      nextDocCode: ok ? nextMap[payload.docCode] : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      message: `「${payload.docName}」${WRITEBACK_MODE_LABEL}失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeWriteback(payload: DocumentPayload): Promise<WritebackStats> {
  if (!isTauriRuntime()) {
    // 浏览器开发环境没有 Tauri 文件写入能力，保留内存结果用于前端验证。
    return mockWriteback(payload);
  }

  return invoke<WritebackStats>('writeback_to_bs_inbox', {
    payload,
    url: resolveBsUrl({ patientId: payload.patientId, docCode: payload.docCode }),
  });
}

function mockWriteback(payload: DocumentPayload): WritebackStats {
  const fieldKeys = Object.keys(payload.fields);
  const stats: WritebackStats = {
    total: fieldKeys.length,
    success: fieldKeys.length,
    failed: 0,
    errors: [],
  };
  localStorage.setItem(
    'medaiPlugin.lastMockWriteback',
    JSON.stringify({ payload, stats, writtenAt: new Date().toISOString() }),
  );
  return stats;
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
