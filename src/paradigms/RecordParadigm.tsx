import { ParadigmProps } from './types';
import { usePatientStore } from '../stores/usePatientStore';
import { getRecordConfig } from './record/recordData';
import RecordDocumentFlow from './record/RecordDocumentFlow';

/**
 * 范式二·事后多模态补录（首次病程/抢救/手术/会诊）。
 * 具体文书差异由 recordData 配置注入，工作流由 RecordDocumentFlow 统一承载。
 */
export default function RecordParadigm({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();
  const config = getRecordConfig(doc, currentPatient);
  return <RecordDocumentFlow doc={doc} config={config} />;
}
