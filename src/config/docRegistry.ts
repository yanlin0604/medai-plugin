// 14 类病历文书权威注册表 —— 范式驱动配置化架构的数据核心
//
// 依据《AI智能病历书写助手插件系统-需求规格说明书》：
//   1) 14类住院病历文书总览表（DOC001-DOC014 权威编码）
//   2) 文书交互范式路由（将14类划分为3大交互范式 + 1类特殊）
//   3) 文书选择中心三组分类（时限必填 / 按需病程 / 特定事件）
//
// 设计原则：范式与文书解耦，文书仅通过 paradigm 字段关联范式骨架，
//          新增文书只需在此追加一条配置，无需改动范式容器（开闭原则）。

/** 三大交互范式 + 死亡记录特殊类 */
export type ParadigmId = 'summary' | 'record' | 'recording' | 'special';

/** 文书选择中心的三组分类 */
export type DocGroupId = 'timed' | 'onDemand' | 'event';

/** 文书客观数据来源 */
export type DataSource = 'HIS' | 'LIS' | 'PACS' | 'EMR' | 'ICD' | 'AI' | '录音' | '问诊' | '医嘱';

/** 文书专属工作台（仅在通用范式不足以表达该文书时配置） */
export type DocWorkspaceId = 'discharge';

// ==================== 范式元数据 ====================

export interface ParadigmMeta {
  id: ParadigmId;
  /** 范式全称 */
  name: string;
  /** 侧边栏短标签（透明化展示当前范式） */
  badge: string;
  /** 一句话交互描述 */
  desc: string;
  /** 范式标识色（hex，沿用现有主题体系） */
  accent: string;
}

export const PARADIGMS: Record<ParadigmId, ParadigmMeta> = {
  summary: {
    id: 'summary',
    name: '系统自动汇总',
    badge: '汇总生成',
    desc: '静默拉取 EMR 历史与检验异常，直接渲染草稿，医生确认即回写',
    accent: '#10B981', // medical.success 绿
  },
  record: {
    id: 'record',
    name: '事后多模态补录',
    badge: '事后补录',
    desc: '拉取时间窗内医嘱用药生成客观时间轴，医生口述补充，AI 交叉拼装',
    accent: '#2563EB', // primary 亮蓝
  },
  recording: {
    id: 'recording',
    name: '长录音互动',
    badge: '录音互动',
    desc: '连续录音 → ASR → 声纹分离 → 语义切片 → 按患者自动路由',
    accent: '#6D28D9', // ai-accent AI 紫
  },
  special: {
    id: 'special',
    name: 'AI 能力边界',
    badge: '人工主导',
    desc: 'AI 仅排版不生成核心内容、不启用语音采集、强制上级医师审核',
    accent: '#EF4444', // medical.danger 红
  },
};

// ==================== 分组元数据 ====================

export interface DocGroupMeta {
  id: DocGroupId;
  name: string;
  /** 分组标签色 */
  tagColor: 'red' | 'green' | 'gray';
}

export const DOC_GROUPS: Record<DocGroupId, DocGroupMeta> = {
  timed: { id: 'timed', name: '时限必填文书', tagColor: 'red' },
  onDemand: { id: 'onDemand', name: '按需书写病程', tagColor: 'green' },
  event: { id: 'event', name: '特定临床事件文书', tagColor: 'gray' },
};

/** 选择中心分组展示顺序 */
export const DOC_GROUP_ORDER: DocGroupId[] = ['timed', 'onDemand', 'event'];

// ==================== 文书定义 ====================

export interface DocDefinition {
  /** 权威编码 DOC001-DOC014 */
  code: string;
  /** 路由/历史兼容 id（doc-001 形式） */
  id: string;
  name: string;
  /** 拼音首字母（支持检索） */
  py: string;
  paradigm: ParadigmId;
  /** 文书选择中心分组；后台运行时文书可由本地注册表按 docCode 补齐 */
  group?: DocGroupId;
  /** 图标名（@ant-design/icons） */
  icon: string;
  /** 对应高保真原型文件（ui_redesign/） */
  prototype: string;
  /** 客观数据来源 */
  dataSources: DataSource[];
  /** 输入模式描述 */
  inputMode: string;
  /** 书写时限（如有） */
  timeLimit?: string;
  /** 特殊标志（如 ai-boundary / mandatory-review / no-asr） */
  flags?: string[];
  /** 专属工作台标识；未配置时使用 paradigm 对应的通用容器 */
  workspace?: DocWorkspaceId;
}

/**
 * 15 类文书权威注册表
 * 范式分布：summary×4 + record×4 + recording×5 + special×1 + homepage×1 = 15
 */
export const DOC_REGISTRY: DocDefinition[] = [
  // ---------- 时限必填文书（红） ----------
  {
    code: 'DOC099', id: 'doc-099', name: '住院病案首页', py: 'zybasfy',
    paradigm: 'record', group: 'timed', icon: 'FileTextOutlined',
    prototype: 'doc_099_case_summary.html',
    dataSources: ['HIS', 'EMR', '医嘱'], inputMode: '选项+自动填充',
    timeLimit: '出院24小时内',
  },
  {
    code: 'DOC001', id: 'doc-001', name: '入院记录', py: 'ryjl',
    paradigm: 'recording', group: 'timed', icon: 'ImportOutlined',
    prototype: 'doc_001_admission.html',
    dataSources: ['HIS', '问诊', '录音'], inputMode: '语音+选项+手动',
    timeLimit: '入院24小时内',
  },
  {
    code: 'DOC002', id: 'doc-002', name: '首次病程记录', py: 'scbcjl',
    paradigm: 'record', group: 'timed', icon: 'FileTextOutlined',
    prototype: 'doc_002_first_course.html',
    dataSources: ['HIS', 'LIS'], inputMode: '选项+手动',
    timeLimit: '入院8小时内',
  },
  {
    code: 'DOC003', id: 'doc-003', name: '日常病程记录', py: 'rcbcjl',
    paradigm: 'recording', group: 'timed', icon: 'ProfileOutlined',
    prototype: 'ward_round_workbench.html',
    dataSources: ['HIS', 'LIS', 'PACS', '录音'], inputMode: '语音+选项',
    timeLimit: '每日',
  },

  // ---------- 按需书写病程（绿） ----------
  {
    code: 'DOC004', id: 'doc-004', name: '主治医生查房记录', py: 'zzyscfjl',
    paradigm: 'recording', group: 'onDemand', icon: 'ProfileOutlined',
    prototype: 'ward_round_workbench.html',
    dataSources: ['HIS', 'LIS', 'PACS', 'EMR', '录音'], inputMode: '语音+选项',
  },
  {
    code: 'DOC017', id: 'doc-017', name: '主治医生首次查房记录', py: 'zzyscscfjl',
    paradigm: 'recording', group: 'onDemand', icon: 'ProfileOutlined',
    prototype: 'ward_round_workbench.html',
    dataSources: ['HIS', 'LIS', 'PACS', 'EMR', '录音'], inputMode: '语音+选项',
  },
  {
    code: 'DOC005', id: 'doc-005', name: '疑难病例讨论记录', py: 'ynbltljl',
    paradigm: 'recording', group: 'onDemand', icon: 'GroupOutlined',
    prototype: 'meeting_workbench.html',
    dataSources: ['EMR', '录音'], inputMode: '手动为主',
  },
  {
    code: 'DOC006', id: 'doc-006', name: '交接班记录', py: 'jjbjl',
    paradigm: 'summary', group: 'onDemand', icon: 'SwapOutlined',
    prototype: 'doc_006_shift.html',
    dataSources: ['EMR'], inputMode: '选项+模板',
  },
  {
    code: 'DOC007', id: 'doc-007', name: '转科记录', py: 'zkjl',
    paradigm: 'summary', group: 'onDemand', icon: 'RetweetOutlined',
    prototype: 'doc_007_transfer.html',
    dataSources: ['EMR'], inputMode: '选项+模板',
  },
  {
    code: 'DOC008', id: 'doc-008', name: '阶段小结', py: 'jdxj',
    paradigm: 'summary', group: 'onDemand', icon: 'SnippetsOutlined',
    prototype: 'doc_008_stage_summary.html',
    dataSources: ['EMR', 'LIS'], inputMode: '选项+模板',
  },
  {
    code: 'DOC014', id: 'doc-014', name: '会诊记录', py: 'hzjl',
    paradigm: 'record', group: 'onDemand', icon: 'SolutionOutlined',
    prototype: 'doc_014_consultation.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+手动',
  },
  {
    code: 'DOC030', id: 'doc-030', name: '会诊记录', py: 'hzjl',
    paradigm: 'record', group: 'onDemand', icon: 'SolutionOutlined',
    prototype: 'doc_014_consultation.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+手动',
  },

  // ---------- 特定临床事件文书（灰） ----------
  {
    code: 'DOC009', id: 'doc-009', name: '抢救记录', py: 'qjjl',
    paradigm: 'record', group: 'event', icon: 'HeartOutlined',
    prototype: 'doc_009_rescue.html',
    dataSources: ['医嘱', '录音'], inputMode: '语音+手动',
  },
  {
    code: 'DOC050', id: 'doc-050', name: '抢救记录', py: 'qjjl',
    paradigm: 'record', group: 'event', icon: 'HeartOutlined',
    prototype: 'doc_009_rescue.html',
    dataSources: ['医嘱', '录音'], inputMode: '语音+手动',
  },
  {
    code: 'DOC010', id: 'doc-010', name: '出院记录', py: 'cyjl',
    paradigm: 'summary', group: 'event', icon: 'ExportOutlined',
    prototype: 'doc_010_discharge.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+模板',
    workspace: 'discharge',
  },
  {
    code: 'DOC011', id: 'doc-011', name: '术前小结', py: 'sqxj',
    paradigm: 'record', group: 'event', icon: 'ScissorOutlined',
    prototype: 'doc_013_operation.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+手动',
  },
  {
    code: 'DOC040', id: 'doc-040', name: '死亡记录', py: 'swjl',
    paradigm: 'special', group: 'event', icon: 'WarningOutlined',
    prototype: 'doc_011_death.html',
    dataSources: ['EMR'], inputMode: '手动为主',
    flags: ['ai-boundary', 'mandatory-review', 'no-asr'],
  },
  {
    code: 'DOC012', id: 'doc-012', name: '围术期记录', py: 'wsqjl',
    paradigm: 'recording', group: 'event', icon: 'CommentOutlined',
    prototype: 'doc_012_death_discussion.html',
    dataSources: ['EMR', '录音'], inputMode: '手动为主',
  },
  {
    code: 'DOC013', id: 'doc-013', name: '手术记录', py: 'ssjl',
    paradigm: 'recording', group: 'event', icon: 'ScissorOutlined',
    prototype: 'doc_013_operation.html',
    dataSources: ['医嘱', '录音'], inputMode: '选项+手动',
  },
  {
    code: 'D0C013', id: 'doc-his-013', name: '手术记录', py: 'ssjl',
    paradigm: 'recording', group: 'event', icon: 'ScissorOutlined',
    prototype: 'doc_013_operation.html',
    dataSources: ['医嘱', '录音'], inputMode: '选项+手动',
  },
  {
    code: 'D0C001', id: 'doc-his-001', name: '入院记录', py: 'ryjl',
    paradigm: 'recording', group: 'timed', icon: 'ImportOutlined',
    prototype: 'doc_001_admission.html',
    dataSources: ['HIS', '问诊', '录音'], inputMode: '语音+选项+手动',
    timeLimit: '入院24小时内',
  },
  {
    code: 'D0C011', id: 'doc-his-011', name: '术前小结', py: 'sqxj',
    paradigm: 'record', group: 'event', icon: 'ScissorOutlined',
    prototype: 'doc_013_operation.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+手动',
  },
  {
    code: 'DOC020', id: 'doc-020', name: '知情同意书', py: 'zqtys',
    paradigm: 'special', group: 'event', icon: 'FileTextOutlined',
    prototype: 'doc_020_consent.html',
    dataSources: ['HIS', 'EMR'], inputMode: '手动为主',
    flags: ['mandatory-review'],
  },
  {
    code: 'DOC060', id: 'doc-060', name: '出院小结', py: 'cyxj',
    paradigm: 'summary', group: 'event', icon: 'ExportOutlined',
    prototype: 'doc_060_discharge_summary.html',
    dataSources: ['HIS', 'EMR'], inputMode: '选项+模板',
  },
];

// ==================== 查询辅助 ====================

const byCode = new Map(DOC_REGISTRY.map((d) => [d.code, d]));
const byId = new Map(DOC_REGISTRY.map((d) => [d.id, d]));

export const getDocByCode = (code: string): DocDefinition | undefined => byCode.get(code);
export const getDocById = (id: string): DocDefinition | undefined => byId.get(id);
export const getDocsByGroup = (group: DocGroupId): DocDefinition[] =>
  DOC_REGISTRY.filter((d) => d.group === group);
export const getDocsByParadigm = (paradigm: ParadigmId): DocDefinition[] =>
  DOC_REGISTRY.filter((d) => d.paradigm === paradigm);

export const findDocInRegistry = (registry: DocDefinition[], code: string): DocDefinition | undefined =>
  registry.find((d) => d.code === code);

export const searchDocRegistry = (registry: DocDefinition[], query: string): DocDefinition[] => {
  const q = query.toLowerCase().trim();
  if (!q) return registry;
  return registry.filter((d) => d.name.includes(query) || d.py.includes(q));
};

/** 文书检索：支持中文名与拼音首字母 */
export const searchDocs = (query: string): DocDefinition[] => {
  return searchDocRegistry(DOC_REGISTRY, query);
};
