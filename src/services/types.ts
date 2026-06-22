// 临床数据契约层 —— 插件与「宿主病历系统(EMR/HIS)」「AI 能力」之间的数据边界。
//
// 设计意图：本插件只负责「产出病历成稿」，不渲染、不持有宿主病历系统的表单 UI。
// 所有外部数据（患者上下文、客观检验、语音转写、AI 草稿、提交落地）一律通过
// service 接口获取，前端只依赖此处的类型契约。后端就绪后替换 service 实现即可，
// 前端无需改动（依赖倒置：UI 依赖抽象契约，而非具体数据来源）。

import type { Patient } from '../stores/usePatientStore';
import type { PatientBrief } from '../components/clinical/EmrContextCard';
import type { TranscriptSegment } from '../components/clinical/TranscriptCard';
import type { IcdItem } from '../components/clinical/IcdRecommend';
import type { QcBubble } from '../components/clinical/QcAuditBox';

// 统一从契约层再导出，业务代码只需 import 此文件
export type { Patient, PatientBrief, TranscriptSegment, IcdItem, QcBubble };

/** LIS 检验 / PACS 影像等客观指标卡片 */
export interface ObjectiveItem {
  /** 指标/检查名称 */
  name: string;
  /** 状态标签（如「↑ 异常」「● 已同步」） */
  status: string;
  statusColor?: string;
  /** 结果值 */
  value: string;
  valueColor?: string;
  /** 参考区间 */
  ref?: string;
  /** 临床解读 */
  desc: string;
  /** 是否危急/异常（高亮） */
  danger?: boolean;
}

/** 病历质控结果（三级质控） */
export interface QcResult {
  grade: string;
  score: number;
  bubbles: QcBubble[];
}

/** 提交至宿主病历系统的文书载荷 */
export interface DocumentPayload {
  /** 文书编码 DOC001-DOC014 */
  docCode: string;
  docName: string;
  /** 患者住院号 */
  patientId: string;
  /** 结构化字段（宿主系统按字段落库，如主诉/现病史/诊断…） */
  fields: Record<string, string>;
  /** 字段中文名称（供前端展示） */
  fieldLabels?: Record<string, string>;
  /** 字段写入顺序（顺序粘贴模式依赖此顺序） */
  fieldOrder?: string[];
  /** 完整正文 */
  content: string;
}

/** 提交结果 */
export interface SubmitResult {
  ok: boolean;
  message: string;
  /** 提交后宿主系统联动建议的下一步文书编码（如有） */
  nextDocCode?: string;
}

/** 患者上下文一致性（防串户：录音识别患者 vs 宿主系统当前患者） */
export interface PatientConsistency {
  consistent: boolean;
  /** 不一致时，宿主系统当前实际选中的患者名 */
  hostPatientName?: string;
}

// ==================== 文书模板配置化（后台下发字段 schema） ====================

/** 字段数据来源（统一来源标签语义，替代散落的"口述提取/待确认/待补充"） */
export type FieldSource = 'his' | 'emr' | 'asr' | 'lis' | 'pacs' | 'manual' | 'ai' | 'option';

/** 字段录入形态 */
export type FieldInputType = 'static' | 'options' | 'text' | 'icd' | 'date';

/** 选项型字段的单个选项（value 为存储值，render 为写入病历正文的规范表述） */
export interface DocFieldOption {
  value: string;
  label: string;
  render: string;
}

/**
 * 文书字段定义 —— 一份文书由哪些字段构成、各字段如何录入与渲染，
 * 全部由此声明，后台可配置下发。新增/调整字段无需改前端代码（开闭原则）。
 */
export interface DocFieldDef {
  /** 字段键（同时作为要素取值的 key） */
  key: string;
  /** 核对界面展示名 */
  label: string;
  /** 归属病历段落（正文分段与落库字段按此聚合） */
  section: string;
  /** 数据来源 */
  source: FieldSource;
  required: boolean;
  inputType: FieldInputType;
  /** options 型可选项 */
  options?: DocFieldOption[];
  /** 默认值（options 的 value / text 的初值） */
  default?: string;
  /** text 型占位符 */
  placeholder?: string;
  /** static 型固定文本（真实环境由 AI 生成填充） */
  staticText?: string;
  /** 是否支持语音口述输入（主诉/现病史等叙述段落：录音转写填入本字段，作为可选加速而非必经步骤） */
  dictatable?: boolean;
  /** 顶部工作台信息槽位（如 patient/date），由后台 renderRule.metaSlot 下发 */
  metaSlot?: string;
}

/** 文书模板（后台按 docCode 下发） */
export interface DocTemplate {
  docCode: string;
  /** 模板版本（后台改版可追踪） */
  version: string;
  title: string;
  fields: DocFieldDef[];
}

/** 字段取值：options/text 为 string；icd 为已采纳诊断数组 */
export type FieldValue = string | IcdItem[];

/** 渲染后的病历段落 */
export interface RenderedSection {
  section: string;
  text: string;
}

/** 模板 + 要素值渲染出的成稿（正文与落库字段同源，杜绝双轨拼装） */
export interface RenderedDoc {
  sections: RenderedSection[];
  /** 完整正文 */
  content: string;
  /** 落库结构化字段（段落名 → 文本） */
  fields: Record<string, string>;
}

// ==================== 文书实例生命周期（草稿 / 版本） ====================

/** 文书草稿（未提交前的工作态，退出/刷新后可恢复） */
export interface DocDraft {
  docCode: string;
  patientId: string;
  /** 要素值（与工作流 values 对应） */
  values: Record<string, FieldValue>;
  /** 当前正文（含医生编辑） */
  content: string;
  /** 工作流进度（停留步骤） */
  step: number;
  status: 'draft' | 'submitted';
  /** 最近更新时间（ISO 字符串，由调用方写入） */
  updatedAt: string;
}

/** 文书版本快照（每次提交后产生一版） */
export interface DocVersion {
  versionNo: number;
  docCode: string;
  patientId: string;
  /** 该版本完整正文 */
  content: string;
  /** 该版本结构化字段 */
  fields: Record<string, string>;
  /** 结构化字段中文名称 */
  fieldLabels?: Record<string, string>;
  /** 字段写入顺序（由后台版本快照保存） */
  fieldOrder?: string[];
  /** 修改人 */
  editor: string;
  /** 提交时间（ISO 字符串） */
  timestamp: string;
  /** 变更摘要 */
  changeSummary: string;
}

/** 版本间单段落差异（older → newer） */
export interface SectionDiff {
  section: string;
  before: string;
  after: string;
  changed: boolean;
}

// ==================== 通用文书工作流（多文书复用） ====================

/** 纸质预览与段落编辑共用的病历段落 */
export interface ClinicalSection {
  /** 前端稳定标识，同一文书内唯一 */
  key: string;
  /** 展示段落名，如「主诉」「诊疗经过」 */
  title: string;
  /** 当前段落正文 */
  text: string;
  /** 提交至宿主病历系统时使用的字段 key */
  fieldKey: string;
  /** 是否允许医生编辑 */
  editable: boolean;
  inputType?: string;
  calculation?: ClinicalFieldCalculation;
  source?: FieldSource;
  required?: boolean;
  /** 当前字段是否由后台配置启用证据补全 */
  evidenceEnabled?: boolean;
}

export interface ClinicalFieldCalculation {
  type?: string;
  startField?: string;
  endField?: string;
  minDays?: number;
  suffix?: string;
}

/** 段落转换为提交载荷前的中间快照 */
export interface DocumentSubmitSnapshot {
  fields: Record<string, string>;
  fieldLabels: Record<string, string>;
  fieldOrder: string[];
  content: string;
  changeSummary: string;
}

/** 查房工作台患者条目，床号仅用于辅助展示，不作为唯一患者标识 */
export interface RoundPatient {
  id: string;
  name: string;
  gender: string;
  age: string;
  bedNo: string;
  diagnosis: string;
  targetDocCodes: Array<'DOC003' | 'DOC004'>;
  identifiers: {
    admissionNo: string;
    displayName: string;
  };
}

/** 查房录音片段，必须绑定患者后才能参与草稿生成 */
export interface RoundVoiceSegment {
  id: string;
  patientId: string | null;
  targetDocCode: 'DOC003' | 'DOC004';
  startedAt: string;
  endedAt?: string;
  originalText: string;
  revisedText: string;
  status: 'draft' | 'confirmed';
  speakerRole?: '上级医师' | '住院医师' | '患者' | '家属';
}

/** 会议讨论录音/转写片段，按发言人与议题归属 */
export interface MeetingVoiceSegment {
  id: string;
  speakerName: string;
  speakerRole: string;
  topicKey: string;
  originalText: string;
  revisedText: string;
  status: 'draft' | 'confirmed';
}

/** 会议型文书配置 */
export interface MeetingConfig {
  docCode: 'DOC005' | 'DOC012';
  title: string;
  patientId: string;
  participants: Array<{ name: string; role: string }>;
  sections: ClinicalSection[];
  conclusionRequiresManualConfirm: boolean;
}

/** 死亡记录人工主导工作态 */
export interface DeathRecordState {
  patientId: string;
  fields: Record<string, string>;
  sections: ClinicalSection[];
  missingItems: string[];
  seniorReviewConfirmed: boolean;
}
