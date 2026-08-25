import type { DocDefinition } from '../../config/docRegistry';
import { getDocByCode } from '../../config/docRegistry';

export interface TitleBarCopy {
  title: string;
  subtitle: string;
}

const DEFAULT_COPY: TitleBarCopy = {
  title: '病历书写助手',
  subtitle: '住院病历 · 病历系统联动',
};

const ROUTE_COPY: Record<string, TitleBarCopy> = {
  '/round': {
    title: '病区查房录音',
    subtitle: '全病区连续走查 · 语音实时分诊',
  },
  '/meeting': {
    title: '疑难讨论记录',
    subtitle: '会议记录 · 智能整理',
  },
  '/settings': {
    title: '系统设置',
    subtitle: '助手配置 · 运行参数',
  },
};

function getDocCodeFromPath(pathname: string): string | null {
  const match = /^\/doc\/([^/]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function resolveWindowTitleBarCopy(
  pathname: string,
  selectedDoc: DocDefinition | null,
): TitleBarCopy {
  if (pathname === '/profile/edit') {
    return {
      title: '修改个人资料',
      subtitle: '个人中心 · 资料编辑',
    };
  }

  if (pathname === '/profile') {
    return {
      title: '个人中心',
      subtitle: '账号资料 · 安全设置',
    };
  }

  const routeCopy = ROUTE_COPY[pathname];
  if (routeCopy) return routeCopy;

  const docCode = getDocCodeFromPath(pathname);
  if (!docCode) return DEFAULT_COPY;

  const doc = selectedDoc?.code === docCode ? selectedDoc : getDocByCode(docCode);
  if (!doc) return DEFAULT_COPY;

  return {
    title: doc.name,
    subtitle: '病历书写助手 · 病历系统联动',
  };
}
