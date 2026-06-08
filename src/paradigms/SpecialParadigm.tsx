import { useMemo } from 'react';
import { ParadigmProps } from './types';
import { usePatientStore } from '../stores/usePatientStore';
import DeathRecordFlow from './special/DeathRecordFlow';
import { buildDeathRecordConfig } from './special/deathData';

/**
 * 特殊·AI 能力边界（死亡记录）
 * 死亡记录采用人工主导工作区：AI 仅做格式整理，不生成核心临床结论。
 */
export default function SpecialParadigm({ doc }: ParadigmProps) {
  const currentPatient = usePatientStore((state) => state.currentPatient);
  const config = useMemo(() => buildDeathRecordConfig(doc, currentPatient), [currentPatient, doc]);
  return <DeathRecordFlow doc={doc} config={config} />;
}
