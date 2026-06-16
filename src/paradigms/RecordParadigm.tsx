import { ParadigmProps } from './types';
import { usePatientStore } from '../stores/usePatientStore';
import { getRecordConfig } from './record/recordData';
import RecordDocumentFlow from './record/RecordDocumentFlow';
import FormDocumentFlow from './record/FormDocumentFlow';

/**
 * 范式二·事后多模态补录（首次病程/抢救/手术/会诊）。
 * 具体文书差异由 recordData 配置注入，工作流由 RecordDocumentFlow 统一承载。
 * DOC099 住院病案首页使用表单范式。
 */
export default function RecordParadigm({ doc }: ParadigmProps) {
  const { currentPatient } = usePatientStore();

  // DOC099 住院病案首页使用表单范式
  if (doc.code === 'DOC099') {
    return <FormDocumentFlow docCode={doc.code} docName={doc.name} />;
  }

  // 其他文书使用原有的事后补录范式
  const config = getRecordConfig(doc, currentPatient);
  return <RecordDocumentFlow doc={doc} config={config} />;
}
