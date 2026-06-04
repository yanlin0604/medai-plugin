import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThunderboltOutlined } from '@ant-design/icons';
import { usePatientStore } from '../../stores/usePatientStore';
import { getDocByCode } from '../../config/docRegistry';
import SummaryParadigm from '../../paradigms/SummaryParadigm';
import RecordParadigm from '../../paradigms/RecordParadigm';
import RecordingParadigm from '../../paradigms/RecordingParadigm';
import SpecialParadigm from '../../paradigms/SpecialParadigm';

/**
 * 文书工作区 —— 范式驱动路由分发器。
 * 根据当前文书的 paradigm 字段，分发到对应范式容器。
 * 这是"范式驱动配置化"架构的运行时核心：新增文书无需改路由，仅在 docRegistry 配置范式即可。
 */
export default function DocWorkspace() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { selectedDoc, currentPatient, selectDoc } = usePatientStore();

  // 优先用 store 选中文书；支持通过 URL code 直达（刷新/外链场景）
  const doc = selectedDoc ?? (code ? getDocByCode(code) ?? null : null);

  // URL 直达时回填 store
  useEffect(() => {
    if (doc && !selectedDoc) selectDoc(doc);
  }, [doc, selectedDoc, selectDoc]);

  if (!doc || !currentPatient) {
    return (
      <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#F8FAFC]">
        <ThunderboltOutlined className="text-[#1E3A8A] text-2xl animate-bounce" />
        <h3 className="text-sm font-bold text-slate-800 mt-3">请先关联患者并选择文书</h3>
        <p className="text-xs text-slate-400 mt-1">返回选择中心，关联患者后选择目标文书以进入对应范式工作区。</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white"
        >
          返回文书选择中心
        </button>
      </div>
    );
  }

  // 范式分发
  switch (doc.paradigm) {
    case 'summary':
      return <SummaryParadigm doc={doc} />;
    case 'record':
      return <RecordParadigm doc={doc} />;
    case 'recording':
      return <RecordingParadigm doc={doc} />;
    case 'special':
      return <SpecialParadigm doc={doc} />;
    default:
      return null;
  }
}
