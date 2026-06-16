import { invoke } from '@tauri-apps/api/core';
import { medicalTerms } from './samples/terms';
import { isTauriRuntime } from './windowMode';

export type BsEditAssistTrigger = 'focus' | 'input' | 'selection';
export type EditAssistSuggestionType = 'term' | 'phrase' | 'rewrite';
export type EditAssistSuggestionSource = 'terms' | 'mock-ai';

export interface BsEditAssistContext {
  source: 'demo-bs' | 'demo-cs' | (string & {});
  patientId: string;
  patientName: string;
  docCode: 'DOC010' | (string & {});
  docName: string;
  fieldKey: string;
  fieldLabel: string;
  fieldValue: string;
  selectedText: string;
  prefix: string;
  selectionStart: number;
  selectionEnd: number;
  trigger: BsEditAssistTrigger | (string & {});
  detectedAt: string;
  receivedAt: string;
}

export interface EditAssistSuggestion {
  id: string;
  type: EditAssistSuggestionType;
  text: string;
  source: EditAssistSuggestionSource;
}

export const EDIT_ASSIST_CONTEXT_MAX_AGE_MS = 10_000;
const MIN_TOKEN_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

const FIELD_PHRASES: Record<string, string[]> = {
  // ========== 入院记录相关字段 ==========
  chiefComplaint: [
    '反复胸痛3年，加重伴大汗1天',
    '活动后胸闷、气促2月余',
    '突发胸骨后疼痛2小时',
    '间断心悸、胸闷1周',
    '反复胸痛1月，再发加重3小时',
    '阵发性胸痛伴大汗半天',
    '劳累后胸闷3月，加重1周',
    '持续胸痛6小时',
    '夜间胸痛憋醒2小时',
    '活动后心悸、气促1月',
  ],
  presentIllness: [
    '患者3年前无明显诱因下出现活动后心前区疼痛，呈压榨样，休息后可缓解，未予重视。近1天来上述症状加重，伴大汗、气促，含服硝酸甘油效果欠佳，为求进一步诊治收住入院。',
    '患者2月余前开始出现活动后胸闷、气促，休息后可缓解，未予系统诊治。近1周症状加重，轻微活动即感不适，伴心悸、乏力，遂来我院就诊，门诊以"冠心病"收入我科。',
    '患者既往体健。2小时前于静息状态下突发胸骨后疼痛，呈压榨样，持续不缓解，伴大汗、恶心，含服硝酸甘油无缓解，急诊就诊，心电图示ST段抬高，急诊以"急性心肌梗死"收入我科。',
    '患者1周来反复出现心悸、胸闷，伴头晕，每次持续数分钟至数十分钟不等，自行缓解。今日症状再发，伴气促、乏力，就诊我院，心电图示心房颤动，收住入院进一步治疗。',
    '患者平素有高血压病史10余年，血压控制欠佳。1月来反复胸痛，多于活动后出现，休息可缓解。3小时前上述症状再发加重，持续不缓解，伴大汗、气促，急诊就诊，拟"不稳定性心绞痛"收入院。',
  ],
  pastHistory: [
    '既往有高血压病史10年，平时口服降压药物治疗，血压控制尚可。否认糖尿病、冠心病病史。',
    '既往体健，否认高血压、糖尿病、冠心病等慢性病史。',
    '有2型糖尿病病史5年，口服二甲双胍治疗，血糖控制可。有高血压病史8年，规律服用降压药。',
    '既往有冠心病病史，3年前曾因急性心肌梗死于外院行冠脉支架植入术，术后规律服用抗血小板及他汀类药物。',
    '有高脂血症病史，未规律服药。否认肝炎、结核等传染病史。',
  ],
  admissionPhysicalExam: [
    '体温36.5℃，脉搏78次/分，呼吸18次/分，血压135/85mmHg。神志清楚，精神可，体型正常，营养中等。双肺呼吸音清，未闻及干湿性啰音。心率78次/分，心律齐，各瓣膜听诊区未闻及病理性杂音。腹软，无压痛，肠鸣音正常。双下肢无水肿。',
    '体温36.8℃，脉搏92次/分，呼吸20次/分，血压148/92mmHg。神志清楚，精神差，痛苦面容。双肺呼吸音清，未闻及明显啰音。心率92次/分，心律齐，心音有力，各瓣膜听诊区未闻及病理性杂音。腹软，无压痛。双下肢无水肿。',
    '体温36.6℃，脉搏68次/分，呼吸19次/分，血压125/75mmHg。神志清楚，精神可。双肺呼吸音清，未闻及干湿性啰音。心率68次/分，心律不齐，心音强弱不等，各瓣膜听诊区未闻及杂音。腹部平软，无压痛反跳痛。双下肢轻度凹陷性水肿。',
  ],
  admissionCondition: [
    '患者因胸痛胸闷入院，症状与活动相关，休息后可部分缓解，入院时神志清楚，生命体征平稳。',
    '患者入院时一般情况可，神志清楚，精神尚可，诉心前区不适，无明显呼吸困难。',
    '入院时患者痛苦面容，诉胸骨后持续疼痛，伴大汗，生命体征尚平稳。',
    '患者入院时神志清楚，精神可，诉活动后心悸、气促，平卧位可，生命体征平稳。',
    '入院时患者一般情况可，神志清楚，诉反复胸闷不适，偶有心悸，生命体征尚稳定。',
  ],
  admissionDiagnosis: [
    '冠状动脉粥样硬化性心脏病，不稳定型心绞痛',
    '急性ST段抬高型心肌梗死',
    '冠状动脉粥样硬化性心脏病，心房颤动',
    '高血压病3级（很高危），冠状动脉粥样硬化性心脏病',
    '急性非ST段抬高型心肌梗死，高血压病2级',
    '冠状动脉粥样硬化性心脏病，陈旧性心肌梗死',
    '冠心病，心功能不全，心功能II级',
    '不稳定型心绞痛，2型糖尿病，高脂血症',
  ],

  // ========== 出院记录相关字段 ==========
  treatmentCourse: [
    '入院后完善相关检查，予以抗血小板聚集、调脂稳定斑块、改善心肌供血、控制血压等治疗。治疗期间动态观察生命体征及心电变化，患者症状较前明显改善，复查心肌标志物下降。',
    '入院后急诊行冠脉造影检查，示前降支近段重度狭窄，予以急诊PCI治疗，植入药物洗脱支架1枚，术后转入CCU监护治疗。术后予以抗血小板、抗凝、调脂、改善心肌重构等治疗，病情稳定。',
    '入院后完善心脏超声、冠脉CTA等检查，予以抗血小板、他汀类药物、ACEI类药物及β受体阻滞剂等治疗。住院期间监测血压、心率，调整用药剂量，症状逐渐缓解。',
    '入院后予以抗凝、控制心室率等治疗，评估后拟行电复律治疗。完善相关检查，排除心房血栓，行电复律治疗，成功转复为窦性心律。继续予以抗凝治疗，病情平稳。',
    '入院后予以抗血小板、调脂、改善心肌供血等对症支持治疗。住院期间未再出现持续性胸痛，复查心电图无明显ST-T改变，心肌标志物正常，病情稳定。',
    '入院后完善冠脉造影检查，示三支病变，经心脏外科会诊后建议行冠脉搭桥手术。完善术前准备，于全麻下行冠状动脉旁路移植术，手术顺利。术后予以抗血小板、调脂、营养心肌等治疗，切口愈合良好。',
    '入院后予以强心、利尿、扩血管等抗心力衰竭治疗，控制液体入量，监测出入量平衡。治疗后患者气促、下肢水肿较前好转，复查心脏超声示左室射血分数较前改善。',
  ],
  dischargeDiagnosis: [
    '冠状动脉粥样硬化性心脏病（I25.101）',
    '急性ST段抬高型心肌梗死（I21.001）',
    '急性非ST段抬高型心肌梗死（I21.401）',
    '不稳定型心绞痛（I20.001）',
    '冠状动脉粥样硬化性心脏病，冠状动脉支架植入术后状态',
    '冠状动脉粥样硬化性心脏病，冠状动脉旁路移植术后',
    '高血压病3级（很高危组）（I10）',
    '心房颤动（I48.001）',
    '慢性心力衰竭，心功能II级（I50.001）',
    '2型糖尿病（E11.900）',
    '混合型高脂血症（E78.201）',
  ],
  dischargeCondition: [
    '患者一般情况可，生命体征平稳，未诉明显胸痛、胸闷，饮食睡眠可，二便正常，具备出院条件。',
    '患者目前症状较入院时明显缓解，无持续性胸痛及气促，活动耐量较前改善，病情稳定，可予出院。',
    '患者出院时一般情况好，生命体征平稳，无明显不适主诉，心电监护未见明显异常，准予出院。',
    '患者术后恢复顺利，切口愈合良好，未诉特殊不适，生命体征平稳，病情稳定，可予出院。',
    '患者经治疗后症状明显好转，无明显胸闷气促，下肢水肿消退，生命体征平稳，病情稳定出院。',
    '患者出院时神志清楚，精神可，未诉明显胸痛胸闷，心律齐整，病情平稳，可予出院继续康复治疗。',
  ],
  dischargeOrders: [
    '出院后继续口服阿司匹林100mg 每日1次、氯吡格雷75mg 每日1次、阿托伐他汀20mg 每晚1次，遵医嘱规律服药，切勿擅自停药。',
    '低盐低脂饮食，每日食盐摄入量<6g，控制总热量摄入，适当增加新鲜蔬菜水果摄入。',
    '避免劳累及情绪激动，保持心情舒畅，适当活动，循序渐进增加活动量。',
    '戒烟限酒，规律作息，保证充足睡眠。',
    '定期监测血压、血糖、血脂，如有异常及时调整用药。',
    '如出现持续性胸痛、胸闷、气促、大汗、心悸等不适，请立即拨打120或就近急诊就诊。',
    '1-2周心内科门诊复诊，复查心电图、心肌标志物、血脂及肝肾功能，根据复查结果调整用药。',
    '术后1月、3月、6月、12月定期复查心脏超声及冠脉CTA，评估支架通畅情况。',
    '出院后如出现切口红肿、渗液、发热等情况，及时就诊换药。',
    '按时服用华法林，每周监测INR，维持INR在2.0-3.0之间，根据INR结果调整华法林剂量。',
  ],
};

const GENERAL_PHRASES = [
  '目前一般情况可，生命体征平稳。',
  '症状较前缓解，继续观察病情变化。',
  '建议遵医嘱规律服药，定期门诊复查。',
  '如有不适及时就诊。',
];

export async function getLatestBsEditAssistContext(): Promise<BsEditAssistContext | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await invoke<BsEditAssistContext | null>('get_latest_bs_edit_assist_context');
  } catch {
    return null;
  }
}

export async function clearLatestBsEditAssistContext() {
  if (!isTauriRuntime()) return;
  try {
    await invoke('clear_latest_bs_edit_assist_context');
  } catch {
    // 清理失败不影响候选面板关闭。
  }
}

export function isUsableEditAssistContext(
  context: BsEditAssistContext | null,
  now = Date.now(),
): context is BsEditAssistContext {
  if (!context) return false;
  // 支持 BS 端和 CS 端
  const isValidSource = context.source === 'demo-bs' || context.source === 'demo-cs';
  if (!isValidSource || context.docCode !== 'DOC010') return false;
  if (!context.fieldKey || !context.fieldLabel) return false;
  if (isEditAssistContextStale(context, now)) return false;
  return getEditAssistToken(context).length >= MIN_TOKEN_LENGTH;
}

export function isEditAssistContextStale(context: Pick<BsEditAssistContext, 'receivedAt' | 'detectedAt'>, now = Date.now()) {
  const timestamp = Date.parse(context.receivedAt || context.detectedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > EDIT_ASSIST_CONTEXT_MAX_AGE_MS;
}

export function getEditAssistToken(context: Pick<BsEditAssistContext, 'selectedText' | 'prefix'>) {
  return (context.selectedText || context.prefix || '').trim();
}

export function getEditAssistModeLabel(context: BsEditAssistContext) {
  return context.selectedText.trim() ? '替换候选' : '术语/续写';
}

export function buildEditAssistSuggestions(
  context: BsEditAssistContext,
  batchIndex = 0,
): EditAssistSuggestion[] {
  const token = getEditAssistToken(context);
  if (token.length < MIN_TOKEN_LENGTH) return [];

  const terms = buildTermSuggestions(token);
  const phrases = context.selectedText.trim()
    ? buildRewriteSuggestions(context.fieldKey, batchIndex)
    : buildPhraseSuggestions(context.fieldKey, token, batchIndex);

  return uniqueSuggestions([...terms, ...phrases]).slice(0, MAX_SUGGESTIONS);
}

export async function copyEditAssistSuggestion(text: string) {
  if (isTauriRuntime()) {
    await invoke('set_clipboard_text', { text });
    return;
  }

  await navigator.clipboard.writeText(text);
}

function buildTermSuggestions(token: string): EditAssistSuggestion[] {
  const starts = medicalTerms.filter((term) => term !== token && term.startsWith(token));
  const includes = medicalTerms.filter((term) => term !== token && !term.startsWith(token) && term.includes(token));
  return [...starts, ...includes].map((text, index) => ({
    id: `term-${index}-${text}`,
    type: 'term' as const,
    text,
    source: 'terms' as const,
  }));
}

function buildPhraseSuggestions(fieldKey: string, token: string, batchIndex: number): EditAssistSuggestion[] {
  const source = FIELD_PHRASES[fieldKey] ?? GENERAL_PHRASES;
  return rotate(source, batchIndex)
    .filter((phrase) => phrase.includes(token) || token.length >= MIN_TOKEN_LENGTH)
    .map((text, index) => ({
      id: `phrase-${batchIndex}-${index}`,
      type: 'phrase' as const,
      text,
      source: 'mock-ai' as const,
    }));
}

function buildRewriteSuggestions(fieldKey: string, batchIndex: number): EditAssistSuggestion[] {
  const source = FIELD_PHRASES[fieldKey] ?? GENERAL_PHRASES;
  return rotate(source, batchIndex).map((text, index) => ({
    id: `rewrite-${batchIndex}-${index}`,
    type: 'rewrite' as const,
    text,
    source: 'mock-ai' as const,
  }));
}

function uniqueSuggestions(items: EditAssistSuggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
}

function rotate<T>(items: T[], batchIndex: number) {
  if (items.length === 0) return [];
  const offset = Math.abs(batchIndex) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
