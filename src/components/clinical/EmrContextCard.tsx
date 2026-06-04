/** 患者简要信息（EMR 上下文卡片用） */
export interface PatientBrief {
  name: string;
  gender: string;
  age: string;
  bed: string;
  admissionNo: string;
  diagnosis?: string;
}

interface Props {
  patient: PatientBrief;
  /** 诊断控件位显示的当前文书名 */
  docControl?: string;
  title?: string;
  /** 防串户熔断时高亮患者名为危险色 */
  nameDanger?: boolean;
}

/**
 * HIS 电子病案 EMR 上下文卡片（左侧 HIS 工作台通用顶部卡片）。
 * 对应需求"HIS核心工作台：上方为患者EMR上下文卡片"。
 */
export default function EmrContextCard({ patient, docControl, title, nameDanger }: Props) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 px-5 py-3.5">
      <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-3">
        <div className="text-[13px] font-bold text-slate-600">
          {title ?? `当前选定患者 EMR 上下文 (住院号: ${patient.admissionNo})`}
        </div>
        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
          在院中
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3 text-xs">
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-md px-2.5 py-2">
          <div className="text-slate-500 mb-0.5">姓名</div>
          <div className={`font-semibold ${nameDanger ? 'text-rose-600' : 'text-slate-800'}`}>{patient.name}</div>
        </div>
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-md px-2.5 py-2">
          <div className="text-slate-500 mb-0.5">性别 / 年龄</div>
          <div className="font-semibold text-slate-800">{patient.gender} / {patient.age}</div>
        </div>
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-md px-2.5 py-2">
          <div className="text-slate-500 mb-0.5">床位号</div>
          <div className="font-semibold text-slate-800">{patient.bed}</div>
        </div>
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-md px-2.5 py-2">
          <div className="text-slate-500 mb-0.5">{docControl ? '诊断控件' : '入院诊断'}</div>
          <div className="font-semibold text-[#1E3A8A]">{docControl ?? patient.diagnosis}</div>
        </div>
      </div>
    </section>
  );
}
