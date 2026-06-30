import { ParadigmProps } from './types';
import AdmissionFlow from './recording/AdmissionFlow';
import RecordingGuide from './recording/RecordingGuide';
import SurgeryFlow from './recording/SurgeryFlow';

const ADMISSION_DOC_CODE = 'DOC001';
const SURGERY_DOC_CODES = new Set(['DOC013', 'D0C013']);
const WORKBENCH_DOC_CODES = new Set(['DOC003', 'DOC004', 'DOC005', 'DOC012']);

/**
 * 范式三·长录音互动（入院/日常病程/上级查房/疑难讨论/手术记录）。
 * 范式内含子变体：入院记录采用床旁问诊四步流；手术记录采用语音口述两步流；其余通过查房/会议工作台采集。
 * 用分发结构隔离各子变体的 hooks。
 */
export default function RecordingParadigm({ doc }: ParadigmProps) {
  // 入院记录：床旁问诊四步流标杆
  if (doc.code === ADMISSION_DOC_CODE) return <AdmissionFlow doc={doc} />;
  // 手术记录：语音口述两步流（录音口述 → AI 结构化 → 确认提交）
  if (SURGERY_DOC_CODES.has(doc.code)) return <SurgeryFlow doc={doc} />;
  // 查房/会议型长录音文书：保留目标文书后进入独立工作台
  if (WORKBENCH_DOC_CODES.has(doc.code)) return <RecordingGuide doc={doc} />;

  // 兜底：仍使用工作台引导，避免新增长录音文书停留在空白页
  return <RecordingGuide doc={doc} />;
}

