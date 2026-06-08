import { useNavigate } from 'react-router-dom';
import { AudioOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { ParadigmProps } from '../types';
import ParadigmShell from '../ParadigmShell';
import { usePatientStore } from '../../stores/usePatientStore';

type RecordingDestination = {
  path: '/round' | '/meeting';
  name: string;
  desc: string;
  scope: string;
};

const ROUND_DOC_CODES = new Set(['DOC003', 'DOC004']);
const MEETING_DOC_CODES = new Set(['DOC005', 'DOC012']);

function getRecordingDestination(docCode: string): RecordingDestination {
  if (MEETING_DOC_CODES.has(docCode)) {
    return {
      path: '/meeting',
      name: '会议工作台',
      desc: '用于疑难病例讨论和死亡讨论记录，按会议主题整理发言、结论与最终草稿。',
      scope: '会议主题 / 关联患者 / 讨论结论',
    };
  }

  return {
    path: '/round',
    name: '查房工作台',
    desc: ROUND_DOC_CODES.has(docCode)
      ? '用于日常病程和上级查房记录，先标注患者，再确认语音片段并生成草稿。'
      : '用于长录音查房场景，先确认目标文书，再进入采集工作台。',
    scope: '患者标注 / 语音片段 / 文书草稿',
  };
}

/**
 * 长录音互动范式中"查房/会议工作台型"文书的引导页。
 * 日常病程/上级查房 → 查房工作台；疑难讨论/死亡讨论 → 会议工作台。
 * 入院记录走 AdmissionFlow 四步流；进入独立工作台前显式保留当前文书上下文。
 */
export default function RecordingGuide({ doc }: ParadigmProps) {
  const navigate = useNavigate();
  const selectDoc = usePatientStore((state) => state.selectDoc);
  const destination = getRecordingDestination(doc.code);

  const enterWorkbench = () => {
    selectDoc(doc);
    navigate(destination.path);
  };

  return (
    <ParadigmShell doc={doc}>
      <div className="h-full flex items-center justify-center bg-[#F8FAFC] p-8">
        <div className="bg-white border border-slate-200 rounded-xl p-7 max-w-[460px] text-center shadow-sm">
          <div className="w-14 h-14 rounded-xl bg-[#6D28D9]/10 text-[#6D28D9] flex items-center justify-center text-2xl mx-auto">
            <AudioOutlined />
          </div>
          <h3 className="text-base font-extrabold text-slate-800 mt-4">{doc.name}</h3>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-slate-500">当前目标文书</span>
              <span className="text-[11px] font-extrabold text-[#6D28D9]">{doc.code}</span>
            </div>
            <p className="mt-1 text-sm font-extrabold text-slate-800">{doc.name}</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{destination.scope}</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mt-3">
            将进入「{destination.name}」。{destination.desc}
          </p>
          <button
            onClick={enterWorkbench}
            className="mt-5 inline-flex items-center justify-center gap-2 bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors"
          >
            进入{destination.name}
            <ArrowRightOutlined className="text-[11px]" />
          </button>
        </div>
      </div>
    </ParadigmShell>
  );
}
