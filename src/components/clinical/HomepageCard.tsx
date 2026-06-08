/** 病案首页卡片组件 —— 展示病案首页的结构化信息 */

interface PatientBasicInfo {
  name: string;
  gender: string;
  age: string;
  idCard: string;
  occupation: string;
  ethnicity: string;
  maritalStatus: string;
}

interface ContactInfo {
  name: string;
  relationship: string;
  phone: string;
  address: string;
}

interface AdmissionInfo {
  admissionNo: string;
  admissionDate: string;
  dischargeDate: string;
  hospitalDays: number;
  admissionDept: string;
  dischargeDept: string;
}

interface DiagnosisInfo {
  primaryDiagnosis: string;
  otherDiagnoses?: string[];
  hospitalInfection?: string;
}

interface OperationInfo {
  date: string;
  name: string;
  surgeon: string;
  anesthesia: string;
}

interface CostInfo {
  total: string;
  medication: string;
  examination: string;
  treatment: string;
  material: string;
  other: string;
}

interface PhysicianSignatures {
  chiefPhysician: string;
  attendingPhysician: string;
  residentPhysician: string;
  coder?: string;
  qualityControl?: string;
}

interface Props {
  patient: PatientBasicInfo;
  contact: ContactInfo;
  admission: AdmissionInfo;
  diagnosis: DiagnosisInfo;
  operation?: OperationInfo;
  cost: CostInfo;
  physicians: PhysicianSignatures;
}

/**
 * 病案首页卡片组件
 * 用于展示病案首页的结构化信息，支持HIS系统自动填充
 */
export default function HomepageCard({
  patient,
  contact,
  admission,
  diagnosis,
  operation,
  cost,
  physicians,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* 标题栏 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3">
        <h2 className="text-white font-bold text-base">病案首页</h2>
        <p className="text-blue-100 text-xs mt-0.5">住院号: {admission.admissionNo}</p>
      </div>

      {/* 患者基本信息 */}
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-blue-500 rounded mr-2"></span>
          患者基本信息
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <InfoItem label="姓名" value={patient.name} />
          <InfoItem label="性别" value={patient.gender} />
          <InfoItem label="年龄" value={patient.age} />
          <InfoItem label="身份证号" value={patient.idCard} />
          <InfoItem label="职业" value={patient.occupation} />
          <InfoItem label="民族" value={patient.ethnicity} />
          <InfoItem label="婚姻状况" value={patient.maritalStatus} />
          <InfoItem label="联系人" value={`${contact.name}(${contact.relationship})`} />
          <InfoItem label="联系电话" value={contact.phone} />
          <InfoItem label="联系地址" value={contact.address} span={3} />
        </div>
      </div>

      {/* 住院信息 */}
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-green-500 rounded mr-2"></span>
          住院信息
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <InfoItem label="入院日期" value={admission.admissionDate} />
          <InfoItem label="出院日期" value={admission.dischargeDate} />
          <InfoItem label="住院天数" value={`${admission.hospitalDays}天`} />
          <InfoItem label="入院科室" value={admission.admissionDept} />
          <InfoItem label="出院科室" value={admission.dischargeDept} />
        </div>
      </div>

      {/* 诊断信息 */}
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-orange-500 rounded mr-2"></span>
          诊断信息
        </h3>
        <div className="space-y-2">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <span className="text-xs font-medium text-orange-700">主要诊断</span>
            <p className="text-sm text-slate-800 mt-1">{diagnosis.primaryDiagnosis}</p>
          </div>
          {diagnosis.otherDiagnoses && diagnosis.otherDiagnoses.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-xs font-medium text-slate-600">其他诊断</span>
              <ul className="mt-1 space-y-1">
                {diagnosis.otherDiagnoses.map((d, i) => (
                  <li key={i} className="text-sm text-slate-700">{d}</li>
                ))}
              </ul>
            </div>
          )}
          {diagnosis.hospitalInfection && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="text-xs font-medium text-red-700">医院感染</span>
              <p className="text-sm text-slate-800 mt-1">{diagnosis.hospitalInfection}</p>
            </div>
          )}
        </div>
      </div>

      {/* 手术信息 */}
      {operation && (
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
            <span className="w-1.5 h-4 bg-purple-500 rounded mr-2"></span>
            手术/操作信息
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <InfoItem label="手术日期" value={operation.date} />
            <InfoItem label="手术名称" value={operation.name} />
            <InfoItem label="术者" value={operation.surgeon} />
            <InfoItem label="麻醉方式" value={operation.anesthesia} />
          </div>
        </div>
      )}

      {/* 费用信息 */}
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-teal-500 rounded mr-2"></span>
          费用信息
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
            <span className="text-xs text-teal-600">总费用</span>
            <p className="text-lg font-bold text-teal-700 mt-1">{cost.total}</p>
          </div>
          <InfoItem label="药品费" value={cost.medication} />
          <InfoItem label="检查费" value={cost.examination} />
          <InfoItem label="治疗费" value={cost.treatment} />
          <InfoItem label="材料费" value={cost.material} />
          <InfoItem label="其他费用" value={cost.other} />
        </div>
      </div>

      {/* 医师签名 */}
      <div className="px-5 py-4 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-slate-500 rounded mr-2"></span>
          医师签名
        </h3>
        <div className="grid grid-cols-5 gap-3">
          <SignatureItem label="主任医师" value={physicians.chiefPhysician} />
          <SignatureItem label="主治医师" value={physicians.attendingPhysician} />
          <SignatureItem label="住院医师" value={physicians.residentPhysician} />
          {physicians.coder && <SignatureItem label="编码员" value={physicians.coder} />}
          {physicians.qualityControl && <SignatureItem label="质控医师" value={physicians.qualityControl} />}
        </div>
      </div>
    </div>
  );
}

/** 信息项组件 */
function InfoItem({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={`bg-[#F8FAFC] border border-slate-200 rounded-md px-2.5 py-2 ${span ? `col-span-${span}` : ''}`}>
      <div className="text-slate-500 text-[10px] mb-0.5">{label}</div>
      <div className="font-semibold text-xs text-slate-800">{value}</div>
    </div>
  );
}

/** 签名项组件 */
function SignatureItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className="bg-white border border-dashed border-slate-300 rounded px-2 py-1.5 min-h-[36px] flex items-center justify-center">
        <span className="text-xs font-medium text-slate-700">{value || '待签名'}</span>
      </div>
    </div>
  );
}
