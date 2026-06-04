// 文书版本历史服务。
//
// 每次「提交至病历系统」产生一个版本快照；支持查看历史版本与版本间差异对比。
// 当前用 样例历史 + localStorage 追加（前端独立可验证）；
// 真实环境改为后端版本/审计接口，替换本文件实现即可，UI 不动。
// TODO: 接后端版本接口（getDocVersions / appendVersion）。

import type { DocVersion, SectionDiff } from './types';
const KEY_PREFIX = 'medai:versions:';
const keyOf = (docCode: string, patientId: string) => `${KEY_PREFIX}${docCode}:${patientId}`;

function readLocal(docCode: string, patientId: string): DocVersion[] {
  try {
    const raw = localStorage.getItem(keyOf(docCode, patientId));
    return raw ? (JSON.parse(raw) as DocVersion[]) : [];
  } catch {
    return [];
  }
}

/** 读取版本历史（样例历史 + 本地追加），按版本号倒序 */
export function getDocVersions(docCode: string, patientId: string): DocVersion[] {
  const all = readLocal(docCode, patientId);
  return all.sort((a, b) => b.versionNo - a.versionNo);
}

/** 追加一个版本快照（提交时调用），版本号自动递增，返回新版本 */
export function appendVersion(
  snapshot: Omit<DocVersion, 'versionNo'>,
): DocVersion {
  const existing = getDocVersions(snapshot.docCode, snapshot.patientId);
  const nextNo = existing.length ? existing[0].versionNo + 1 : 1;
  const version: DocVersion = { ...snapshot, versionNo: nextNo };
  try {
    const local = readLocal(snapshot.docCode, snapshot.patientId);
    local.push(version);
    localStorage.setItem(keyOf(snapshot.docCode, snapshot.patientId), JSON.stringify(local));
  } catch {
    // ignore
  }
  return version;
}

/** 计算两版本按段落的差异（older → newer） */
export function getVersionDiff(older: DocVersion, newer: DocVersion): SectionDiff[] {
  const sections = Array.from(new Set([...Object.keys(older.fields), ...Object.keys(newer.fields)]));
  return sections.map((section) => {
    const before = older.fields[section] ?? '';
    const after = newer.fields[section] ?? '';
    return { section, before, after, changed: before !== after };
  });
}
