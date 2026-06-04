import { ParadigmProps } from './types';
import AdmissionFlow from './recording/AdmissionFlow';
import RecordingGuide from './recording/RecordingGuide';

/**
 * 范式三·长录音互动（入院/日常病程/上级查房/疑难讨论/死亡讨论）。
 * 范式内含子变体：入院记录采用床旁问诊四步流；其余通过查房/会议工作台采集。
 * 用分发结构隔离各子变体的 hooks。
 */
export default function RecordingParadigm({ doc }: ParadigmProps) {
  // 入院记录：床旁问诊四步流标杆
  if (doc.code === 'DOC001') return <AdmissionFlow doc={doc} />;
  // 其余长录音文书：引导至查房/会议工作台
  return <RecordingGuide doc={doc} />;
}
