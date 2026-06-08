import { ParadigmProps } from './types';
import { usePatientStore } from '../stores/usePatientStore';
import { getSummaryConfig } from './summary/summaryData';
import SummaryDocumentFlow from './summary/SummaryDocumentFlow';

/**
 * 范式一·系统自动汇总（病案首页/交接班/转科/阶段小结）。
 * 具体文书差异由 summaryData 配置注入，工作流由 SummaryDocumentFlow 统一承载。
 */
export default function SummaryParadigm({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const config = getSummaryConfig(doc, currentPatient);
  return <SummaryDocumentFlow doc={doc} config={config} />;
}
