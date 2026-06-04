// 文书草稿本地暂存服务。
//
// 未提交的文书工作态（要素值 / 正文 / 进度）在此持久化，
// 确保插件退出或刷新后草稿不丢失，下次进入同一患者同一文书自动恢复。
// 当前用 localStorage 落地（前端独立可验证）；真实环境改为后端草稿箱接口
// （按 医生 + 患者 + 文书 维度存储），替换本文件实现即可，UI 不动。
// TODO: 替换为后端草稿接口（saveDraft/loadDraft/listDrafts/clearDraft）。

import type { DocDraft } from './types';

const KEY_PREFIX = 'medai:draft:';
const keyOf = (docCode: string, patientId: string) => `${KEY_PREFIX}${docCode}:${patientId}`;

/** 保存/更新草稿（按 文书+患者 唯一） */
export function saveDraft(draft: DocDraft): void {
  try {
    localStorage.setItem(keyOf(draft.docCode, draft.patientId), JSON.stringify(draft));
  } catch {
    // 持久化失败（隐私模式 / 容量限制）不阻断业务
  }
}

/** 读取指定 文书+患者 的草稿；无则返回 null */
export function loadDraft(docCode: string, patientId: string): DocDraft | null {
  try {
    const raw = localStorage.getItem(keyOf(docCode, patientId));
    return raw ? (JSON.parse(raw) as DocDraft) : null;
  } catch {
    return null;
  }
}

/** 清除指定 文书+患者 的草稿 */
export function clearDraft(docCode: string, patientId: string): void {
  try {
    localStorage.removeItem(keyOf(docCode, patientId));
  } catch {
    // ignore
  }
}

/** 列出全部草稿（可按患者过滤），按更新时间倒序 */
export function listDrafts(patientId?: string): DocDraft[] {
  const result: DocDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const d = JSON.parse(raw) as DocDraft;
      if (!patientId || d.patientId === patientId) result.push(d);
    }
  } catch {
    // ignore
  }
  return result.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
