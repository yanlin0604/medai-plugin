// 病案首页（DOC000）样例数据。
//
// ⚠️ 仅为接口层的「样例实现」数据源，供前端工作流在后端就绪前真实跑通。
// 数据临床内容源自《病历书写基本规范》中病案首页要求。
// TODO: 后端就绪后，本文件由 clinicalService 的真实接口实现替代。

import type { PatientBrief } from '../types';

/** 病案首页患者基本信息 */
export interface HomepagePatientInfo {
  name: string;
  gender: string;
  age: string;
  idCard: string;
  occupation: string;
  ethnicity: string;
  maritalStatus: string;
}

/** 联系人信息 */
export interface ContactInfo {
  name: string;
  relationship: string;
  phone: string;
  address: string;
}

/** 住院信息 */
export interface AdmissionInfo {
  admissionNo: string;
  admissionDate: string;
  dischargeDate: string;
  hospitalDays: number;
  admissionDept: string;
  dischargeDept: string;
}

/** 诊断信息 */
export interface DiagnosisInfo {
  primaryDiagnosis: string;
  primaryDiagnosisCode: string;
  otherDiagnoses: Array<{ name: string; code: string }>;
  hospitalInfection?: string;
}

/** 手术/操作信息 */
export interface OperationInfo {
  date: string;
  name: string;
  code: string;
  surgeon: string;
  anesthesia: string;
}

/** 费用信息 */
export interface CostInfo {
  total: string;
  medication: string;
  examination: string;
  treatment: string;
  material: string;
  other: string;
}

/** 医师签名 */
export interface PhysicianSignatures {
  chiefPhysician: string;
  attendingPhysician: string;
  residentPhysician: string;
  coder?: string;
  qualityControl?: string;
}

/** 病案首页完整数据 */
export interface HomepageData {
  patient: HomepagePatientInfo;
  contact: ContactInfo;
  admission: AdmissionInfo;
  diagnosis: DiagnosisInfo;
  operation?: OperationInfo;
  cost: CostInfo;
  physicians: PhysicianSignatures;
}

/** 样例患者简要信息 */
export const homepagePatientBrief: PatientBrief = {
  name: '陈建国',
  gender: '男',
  age: '65岁',
  bed: '1201',
  admissionNo: 'ZY20260001',
  diagnosis: '冠状动脉粥样硬化性心脏病',
};

/** 病案首页完整样例数据 */
export const homepageData: HomepageData = {
  patient: {
    name: '陈建国',
    gender: '男',
    age: '65岁',
    idCard: '110101195801011234',
    occupation: '退休',
    ethnicity: '汉族',
    maritalStatus: '已婚',
  },
  contact: {
    name: '刘淑芬',
    relationship: '配偶',
    phone: '13800138000',
    address: '北京市朝阳区XX路XX号',
  },
  admission: {
    admissionNo: 'ZY20260001',
    admissionDate: '2024-01-15',
    dischargeDate: '2024-01-25',
    hospitalDays: 10,
    admissionDept: '心血管内科',
    dischargeDept: '心血管内科',
  },
  diagnosis: {
    primaryDiagnosis: '冠状动脉粥样硬化性心脏病',
    primaryDiagnosisCode: 'I25.1',
    otherDiagnoses: [
      { name: '高血压病3级', code: 'I10' },
      { name: '2型糖尿病', code: 'E11.9' },
    ],
  },
  operation: {
    date: '2024-01-20',
    name: '冠状动脉造影术',
    code: '36.06',
    surgeon: '何卫东',
    anesthesia: '局部麻醉',
  },
  cost: {
    total: '¥45,680.00',
    medication: '¥12,350.00',
    examination: '¥8,920.00',
    treatment: '¥15,680.00',
    material: '¥5,230.00',
    other: '¥3,500.00',
  },
  physicians: {
    chiefPhysician: '何卫东',
    attendingPhysician: '曹文杰',
    residentPhysician: '孙瑞祥',
    coder: '陆雅琴',
    qualityControl: '方晓燕',
  },
};

/** 病案首页草稿样例（AI 自动生成） */
export const homepageDraft = `【病案首页】

患者基本信息：
姓名：陈建国，性别：男，年龄：65岁
身份证号：110101195801011234
职业：退休，民族：汉族，婚姻状况：已婚
联系人：刘淑芬（配偶），电话：13800138000
地址：北京市朝阳区XX路XX号

住院信息：
住院号：ZY20260001
入院日期：2024-01-15，出院日期：2024-01-25
住院天数：10天
入院科室：心血管内科，出院科室：心血管内科

诊断信息：
主要诊断：冠状动脉粥样硬化性心脏病（I25.1）
其他诊断：
1. 高血压病3级（I10）
2. 2型糖尿病（E11.9）

手术/操作：
手术日期：2024-01-20
手术名称：冠状动脉造影术（36.06）
术者：何卫东
麻醉方式：局部麻醉

费用信息：
总费用：¥45,680.00
药品费：¥12,350.00
检查费：¥8,920.00
治疗费：¥15,680.00
材料费：¥5,230.00
其他：¥3,500.00

医师签名：
主任医师：何卫东
主治医师：曹文杰
住院医师：孙瑞祥
编码员：陆雅琴
质控医师：方晓燕`;
