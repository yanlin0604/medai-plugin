import { useNavigate } from 'react-router-dom';
import { AudioOutlined } from '@ant-design/icons';
import { ParadigmProps } from '../types';
import ParadigmShell from '../ParadigmShell';

/**
 * 长录音互动范式中"查房/会议工作台型"文书的引导页。
 * 日常病程/上级查房 → 查房工作台；疑难讨论/死亡讨论 → 会议工作台。
 * （入院记录走 AdmissionFlow 四步流；查房/会议工作台为独立页面，后续实现）
 */
export default function RecordingGuide({ doc }: ParadigmProps) {
  const navigate = useNavigate();
  const toMeeting = doc.code === 'DOC005' || doc.code === 'DOC012';
  const target = toMeeting ? '/meeting' : '/round';
  const targetName = toMeeting ? '会议工作台' : '查房工作台';

  return (
    <ParadigmShell doc={doc}>
      <div className="h-full flex items-center justify-center bg-[#F8FAFC] p-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-[440px] text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-[#6D28D9]/10 text-[#6D28D9] flex items-center justify-center text-2xl mx-auto">
            <AudioOutlined />
          </div>
          <h3 className="text-base font-extrabold text-slate-800 mt-4">{doc.name}</h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-2">
            本文书属于<b className="text-[#6D28D9]">长录音互动</b>范式，通过「{targetName}」连续录音采集，
            经 AI 声纹分离与语义切片后自动路由至对应患者生成草稿。
          </p>
          <button
            onClick={() => navigate(target)}
            className="mt-5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors"
          >
            前往{targetName}采集
          </button>
        </div>
      </div>
    </ParadigmShell>
  );
}
