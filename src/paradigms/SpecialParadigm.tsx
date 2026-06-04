import { ParadigmProps } from './types';
import ParadigmPlaceholder from './ParadigmPlaceholder';

/**
 * 特殊·AI 能力边界（死亡记录）
 * TODO: 依据 doc_011_death.html 实现 AI 边界警告横幅 + 人工锁定撰写 + 强制审核
 */
export default function SpecialParadigm({ doc }: ParadigmProps) {
  return <ParadigmPlaceholder doc={doc} />;
}
