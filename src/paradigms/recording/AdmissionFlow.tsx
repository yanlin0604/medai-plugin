import { useState, useRef, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { message, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioOutlined,
  ExpandAltOutlined,
  HistoryOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ParadigmProps } from '../types';
import ParadigmShell from '../ParadigmShell';
import { useNavigate } from 'react-router-dom';
import { getDocByCode } from '../../config/docRegistry';
import type { DocDefinition } from '../../config/docRegistry';
import { useHotkey } from '../../hooks/useHotkey';
import WorkflowStepper from '../../components/clinical/WorkflowStepper';
import QcAuditBox from '../../components/clinical/QcAuditBox';
import MeltdownAlert from '../../components/clinical/MeltdownAlert';
import WritebackBar from '../../components/clinical/WritebackBar';
import WritebackTargetBar from '../../components/clinical/WritebackTargetBar';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import SectionEditor from '../../components/clinical/SectionEditor';
import { usePatientStore } from '../../stores/usePatientStore';
import { admissionPatient } from '../../services/samples/admission';
import {
  getObjectiveData,
  recommendIcd,
  runQc,
  getDocTemplate,
  renderDocument,
} from '../../services/clinicalService';
import { submitDocument, watchPatientConsistency } from '../../services/emsBridge';
import { saveDraft, loadDraft } from '../../services/draftService';
import { appendVersion, getDocVersions } from '../../services/versionService';
import type {
  ObjectiveItem,
  IcdItem,
  QcResult,
  PatientBrief,
  DocTemplate,
  DocFieldDef,
  FieldValue,
  FieldSource,
} from '../../services/types';

const STEPS = [
  { id: 1, label: '要素填写' },
  { id: 2, label: '诊断质控' },
  { id: 3, label: '成稿提交' },
];

// 字段来源 → 统一标签（语义由 source 单一决定）
const SOURCE_META: Record<FieldSource, { text: string; cls: string }> = {
  his: { text: 'HIS 同步', cls: 'text-[#166534] bg-[#F0FDF4]' },
  asr: { text: '可口述', cls: 'text-[#1E3A8A] bg-[#F0F5FF]' },
  lis: { text: '检验同步', cls: 'text-[#166534] bg-[#F0FDF4]' },
  pacs: { text: '影像同步', cls: 'text-[#166534] bg-[#F0FDF4]' },
  manual: { text: '待补充', cls: 'text-[#854D0E] bg-[#FFFBEB]' },
  ai: { text: 'AI 生成', cls: 'text-[#6D28D9] bg-[#F5F3FF]' },
  option: { text: '选填', cls: 'text-[#475569] bg-[#F1F5F9]' },
};

// 草稿自动保存时间格式化
const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// 划词优化样例实现（真实环境调用 AI 改写服务）
function optimizeText(text: string, mode: string): string {
  if (mode === 'expand') return `${text}（详见专科查体记录）`;
  if (mode === 'shorten') return `${text.slice(0, Math.ceil(text.length / 2))}…`;
  if (mode === 'polish') return text.replace(/疼痛/g, '压榨样疼痛').replace(/待补充/g, '需结合后续检查结果进一步补充');
  return text.replace(/疼痛/g, '压榨样疼痛');
}

function renderWritebackValue(
  field: DocFieldDef,
  value: FieldValue | undefined,
  sectionOverride?: string,
): string {
  if (sectionOverride != null) return sectionOverride.trim();
  switch (field.inputType) {
    case 'static':
      return ((value as string | undefined) ?? field.staticText ?? '').trim();
    case 'options': {
      const v = (value as string | undefined) ?? field.default ?? '';
      return field.options?.find((o) => o.value === v)?.render ?? '';
    }
    case 'text':
      return ((value as string | undefined) ?? field.default ?? '').trim();
    case 'icd': {
      const list = (value as IcdItem[] | undefined) ?? [];
      return list.length ? list.map((d, i) => `${i + 1}. ${d.name} [${d.code}]`).join('；') : '';
    }
    default:
      return '';
  }
}

// 要素选项按钮
function OptBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${active ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white font-bold' : 'bg-white border-slate-300 text-slate-700 hover:border-[#1E3A8A]'
        }`}
    >
      {children}
    </button>
  );
}

// 单个要素填写行（按字段 schema 渲染，文本类字段统一直接编辑）
function FieldRow({
  field,
  value,
  onChange,
  optimize,
}: {
  field: DocFieldDef;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  optimize: (text: string, mode: string) => string;
}) {
  const src = SOURCE_META[field.source];
  const [resetKey, setResetKey] = useState(0);
  // static 字段显示值：医生编辑/口述过则用其值；dictatable 字段已初始化为空串，未填则留空
  const raw = (value as string) ?? field.staticText ?? '';
  const resetText = field.inputType === 'text' ? field.default ?? '' : field.dictatable ? '' : field.staticText ?? '';

  if (field.inputType === 'static' || field.inputType === 'text') {
    return (
      <SectionEditor
        key={`${field.key}-${resetKey}`}
        section={field.label}
        text={raw}
        edited={raw !== resetText}
        locked={false}
        sectionSuffix={(
          <>
            {field.required && <span className="text-rose-500 text-[10px]">*</span>}
            <span className={`font-normal px-1 rounded text-[9px] ${src.cls}`}>{src.text}</span>
          </>
        )}
        onChange={(t) => onChange(t)}
        onReset={() => {
          onChange(resetText);
          setResetKey((n) => n + 1);
        }}
        optimize={optimize}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
        <span>
          {field.label}
          {field.required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <span className={`font-normal px-1 rounded text-[9px] ${src.cls}`}>{src.text}</span>
      </div>

      {field.inputType === 'options' && (
        <div className="flex gap-2 flex-wrap">
          {field.options!.map((o) => (
            <OptBtn key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
              {o.label}
            </OptBtn>
          ))}
        </div>
      )}
    </div>
  );
}

// 语音口述病史入口（可选）：一次连续口述，由 ASR+AI 自动分配填入主诉/现病史等叙述字段，免逐项手输。
// 与手输/点选并列、非前置步骤——不想用可直接无视，在下方手动填写。
function DictationPanel({ count, onApply }: { count: number; onApply: () => void }) {
  const [recording, setRecording] = useState(false);
  const finish = () => {
    setRecording(false);
    onApply();
  };
  return (
    <div className="bg-[#F0F5FF] border border-[#BFDBFE] rounded-lg p-3">
      {recording ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-bold text-[#1E3A8A] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
            正在聆听 · 连续口述病史，说完点结束
          </span>
          <button
            onClick={finish}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-1.5 rounded-md bg-[#EF4444] hover:bg-rose-600 text-white transition-colors"
          >
            <StopOutlined />
            结束并自动整理
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setRecording(true)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-1.5 rounded-md bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
          >
            <AudioOutlined />
            语音口述病史（可选）
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-1.5 leading-relaxed">
            连续口述，自动填入主诉、现病史等 {count} 项，免逐项手输；也可直接在下方手动填写
          </p>
        </>
      )}
    </div>
  );
}

/**
 * 入院记录三步流（范式三标杆 · 纯侧边栏单栏形态）。
 * 要素填写 → 诊断质控 → 成稿提交。
 * 以「结构化要素填写」为中心：客观数据（LIS/PACS）自动集成只读、既往史/个人史等选项点选，
 * 主诉/现病史以手输为主、语音口述为可选加速——录音不再是进入流程的前置步骤
 * （契合"入院记录多在医生办公室成稿、无床旁录音时手输更快"的真实工作流）。
 * 文书字段由后台模板（getDocTemplate）配置化下发，前端按 schema 动态渲染。
 * 成稿(Step3)按 section 分段呈现/编辑：各段值经 sectionEdits 叠加在 renderDocument 之上，
 * 正文与落库字段同源派生（finalContent/finalFields），不再对整篇做脆弱的反解析。
 * 成稿经底部「提交至病历系统」回写至宿主对应字段；插件不渲染宿主表单。
 */
export default function AdmissionFlow({ doc }: ParadigmProps) {
  const { currentPatient, selectDoc } = usePatientStore();
  const navigate = useNavigate();
  // 患者上下文来自宿主病历系统当前选中患者（首页关联）
  const patient: PatientBrief = currentPatient
    ? {
      name: currentPatient.name,
      gender: currentPatient.gender,
      age: currentPatient.age,
      bed: currentPatient.bedNo,
      admissionNo: currentPatient.id,
      diagnosis: currentPatient.diagnosis,
    }
    : admissionPatient;

  const [step, setStep] = useState(1);
  // 流程门禁：已解锁的最大步骤，禁止跳到未完成的后续步骤
  const [maxStep, setMaxStep] = useState(1);
  const [locked, setLocked] = useState(false);
  // 提交后宿主联动建议的下一步文书
  const [nextDoc, setNextDoc] = useState<DocDefinition | null>(null);

  // 步骤前进（同时推进门禁上限）；回退由步骤条直接 setStep
  const goStep = (n: number) => {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  // 防串户一致性：真实环境由 emsBridge 患者切换事件驱动；样例下恒一致
  const [mismatch, setMismatch] = useState(false);

  // 模板（字段 schema）与要素值
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});

  // 服务数据
  const [objective, setObjective] = useState<ObjectiveItem[]>([]);
  const [icdItems, setIcdItems] = useState<IcdItem[]>([]);
  const [qc, setQc] = useState<QcResult | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // 草稿暂存
  const hydratedRef = useRef(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // 历史版本抽屉
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);

  // 成稿分段编辑：sectionEdits 存各段手动改写(override)；resetKeys 用于重置时强制 remount；previewMode 通读全文
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({});
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [previewMode, setPreviewMode] = useState(true);

  // 进入时拉取模板 + 客观数据/ICD/质控，并按 schema 初始化要素值
  useEffect(() => {
    let alive = true;
    (async () => {
      const pid = patient.admissionNo;
      // 客观数据/ICD/质控进入即拉取；叙述段落的语音转写改由字段级「口述」即时触发，录音不再是前置步骤
      const [tpl, obj, icd, q] = await Promise.all([
        getDocTemplate(doc.code),
        getObjectiveData(pid),
        recommendIcd(pid),
        runQc(pid, ''),
      ]);
      if (!alive) return;
      setObjective(obj);
      setIcdItems(icd);
      setQc(q);
      setTemplate(tpl);
      // 按字段类型初始化要素值：options/text 取默认值，icd 默认全采纳
      const init: Record<string, FieldValue> = {};
      tpl?.fields.forEach((f) => {
        if (f.key === 'patientInfo') {
          init[f.key] = `姓名：${patient.name}，性别：${patient.gender}，年龄：${patient.age}，床位：${patient.bed}，住院号：${patient.admissionNo}，入院诊断：${patient.diagnosis}。`;
        } else if (f.inputType === 'options' || f.inputType === 'text') init[f.key] = f.default ?? '';
        else if (f.inputType === 'icd') init[f.key] = icd;
        // 叙述段落（主诉/现病史）默认置空，待医生手输或口述填入——不预填示例文本，避免演示感
        else if (f.inputType === 'static' && f.dictatable) init[f.key] = '';
      });
      // 优先恢复上次未完成草稿，否则用模板默认值
      const saved = loadDraft(doc.code, pid);
      if (saved) {
        setValues(saved.values);
        // 旧版四步流草稿的 step 可能为 4，新版三步流收敛到合法范围
        setStep(Math.min(saved.step, STEPS.length));
        setMaxStep(Math.min(saved.step, STEPS.length));
        if (saved.status === 'submitted') setLocked(true);
        else message.info('已恢复上次未完成的草稿。');
      } else {
        setValues(init);
      }
      hydratedRef.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [patient.admissionNo, doc.code]);

  // 防串户：订阅宿主系统患者一致性（真实环境由患者切换事件驱动）
  useEffect(() => {
    const stop = watchPatientConsistency(patient.admissionNo, (c) => setMismatch(!c.consistent));
    return stop;
  }, [patient.admissionNo]);

  useEffect(() => {
    setVersionCount(getDocVersions(doc.code, patient.admissionNo).length);
  }, [doc.code, patient.admissionNo, locked]);

  // 成稿渲染（正文与落库字段同源）
  const rendered = useMemo(() => (template ? renderDocument(template, values) : null), [template, values]);

  // 最终成稿分段：renderDocument 的段叠加手动 override（单一数据源，提交不再反解析）
  const finalSections = useMemo(
    () =>
      (rendered?.sections ?? []).map((s) => ({
        section: s.section,
        text: sectionEdits[s.section] ?? s.text,
        edited: sectionEdits[s.section] != null,
      })),
    [rendered, sectionEdits],
  );
  const finalContent = useMemo(
    () => finalSections.map((s) => `【${s.section}】${s.text}`).join('\n'),
    [finalSections],
  );

  const sectionFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    template?.fields.forEach((field) => {
      counts.set(field.section, (counts.get(field.section) ?? 0) + 1);
    });
    return counts;
  }, [template]);

  const writebackFields = useMemo(
    () =>
      Object.fromEntries(
        (template?.fields ?? []).map((field) => {
          const sectionOverride =
            sectionFieldCounts.get(field.section) === 1 ? sectionEdits[field.section] : undefined;
          return [field.key, renderWritebackValue(field, values[field.key], sectionOverride)];
        }),
      ),
    [template, sectionEdits, sectionFieldCounts, values],
  );
  const writebackFieldOrder = useMemo(() => template?.fields.map((field) => field.key) ?? [], [template]);
  const writebackFieldLabels = useMemo(
    () => Object.fromEntries((template?.fields ?? []).map((field) => [field.key, field.label])),
    [template]
  );

  // 段落手动改写 / 重置（重置经 resetKeys 触发 SectionEditor remount 复位）
  const editSection = (section: string, text: string) => setSectionEdits((prev) => ({ ...prev, [section]: text }));
  const resetSection = (section: string) => {
    setSectionEdits((prev) => {
      const next = { ...prev };
      delete next[section];
      return next;
    });
    setResetKeys((prev) => ({ ...prev, [section]: (prev[section] ?? 0) + 1 }));
  };

  // 防抖自动暂存草稿（退出/刷新后可恢复）；锁定（已提交）态不覆盖
  useEffect(() => {
    if (!hydratedRef.current || !template || locked) return;
    const t = setTimeout(() => {
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values,
        content: finalContent,
        step,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
      setSavedAt(new Date());
    }, 800);
    return () => clearTimeout(t);
  }, [values, step, finalContent, template, locked, doc.code, patient.admissionNo]);

  const setVal = (key: string, v: FieldValue) => setValues((prev) => ({ ...prev, [key]: v }));

  // 要素核对不重复展示患者基本信息；诊断和诊疗计划在「诊断质控」步骤处理
  const elementFields = useMemo(
    () => template?.fields.filter((f) => !['patientInfo', 'diagnoses', 'treatmentPlan'].includes(f.key)) ?? [],
    [template],
  );

  // 可口述字段（主诉/现病史等叙述段落）：统一由「语音口述」入口一次连续口述、自动分配填入
  const dictateFields = useMemo(() => template?.fields.filter((f) => f.dictatable) ?? [], [template]);

  // 应用口述结果：将一段连续口述分配到各叙述字段（样例以 staticText 模拟 ASR+AI 分段，真实环境替换为转写分配服务）
  const applyDictation = () => {
    if (!dictateFields.length) return;
    setValues((prev) => {
      const next = { ...prev };
      dictateFields.forEach((f) => {
        next[f.key] = f.staticText ?? '';
      });
      return next;
    });
    message.success(`已根据口述自动填入${dictateFields.length}项，请核对。`);
  };

  // 诊断字段（icd 型）：key 由模板决定，不再硬编码 'diagnoses'，后台可自由配置字段键
  const icdField = useMemo(() => template?.fields.find((f) => f.inputType === 'icd') ?? null, [template]);
  const icdKey = icdField?.key ?? 'diagnoses';
  const treatmentPlanField = useMemo(() => template?.fields.find((f) => f.key === 'treatmentPlan') ?? null, [template]);
  const treatmentPlan = (values[treatmentPlanField?.key ?? 'treatmentPlan'] as string) ?? '';

  // ICD 诊断勾选（已采纳列表始终按候选顺序排列，保证编号稳定）
  const acceptedIcd = (values[icdKey] as IcdItem[]) ?? [];
  const toggleIcd = (item: IcdItem) =>
    setValues((prev) => {
      const cur = (prev[icdKey] as IcdItem[]) ?? [];
      const codes = new Set(cur.map((d) => d.code));
      if (codes.has(item.code)) codes.delete(item.code);
      else codes.add(item.code);
      return { ...prev, [icdKey]: icdItems.filter((d) => codes.has(d.code)) };
    });

  // 样例 AI 生成：真实环境替换为诊疗计划生成服务，输入应包含医生确认诊断、关键客观依据和病史要素
  const generateTreatmentPlan = () => {
    if (!treatmentPlanField) return;
    if (!acceptedIcd.length) {
      message.warning('请先确认至少一条初步诊断，再生成诊疗计划。');
      return;
    }
    setGeneratingPlan(true);
    window.setTimeout(() => {
      const hasCriticalTroponin = objective.some((o) => o.name.includes('肌钙蛋白') && o.danger);
      const plan = [
        hasCriticalTroponin ? '完善心肌酶谱动态复查、连续心电监测及心脏超声检查。' : '完善相关实验室检查及影像学检查。',
        '结合已确认初步诊断，予以抗血小板、调脂稳定斑块、控制血压等对症及病因治疗。',
        '严密观察胸痛、生命体征及心电变化，必要时请心内科进一步评估。',
      ].join('');
      setVal(treatmentPlanField.key, plan);
      setGeneratingPlan(false);
      message.success('已生成诊疗计划，请医生审核修改。');
    }, 500);
  };

  // 实际提交（确认后执行）：以最终分段成稿为单一数据源，content/fields 同源自 finalSections
  const doSubmit = async () => {
    if (!rendered) return;
    const content = finalContent;
    const fields = writebackFields;
    const res = await submitDocument({
      docCode: doc.code,
      docName: doc.name,
      patientId: patient.admissionNo,
      fields,
      fieldLabels: writebackFieldLabels,
      fieldOrder: writebackFieldOrder,
      content,
    });
    if (res.ok) {
      setLocked(true);
      const now = new Date().toISOString();
      saveDraft({
        docCode: doc.code,
        patientId: patient.admissionNo,
        values,
        content,
        step,
        status: 'submitted',
        updatedAt: now,
      });
      // 生成版本快照（写入版本历史）
      const version = appendVersion({
        docCode: doc.code,
        patientId: patient.admissionNo,
        content,
        fields,
        editor: '林志远 主治医师', // TODO: 取自 emsBridge.getHostSession
        timestamp: now,
        changeSummary: '医生确认并提交至病历系统',
      });
      setVersionCount((count) => Math.max(count + 1, version.versionNo));
      // 宿主联动：记录建议的下一步文书，提供一键跳转入口
      setNextDoc(res.nextDocCode ? getDocByCode(res.nextDocCode) ?? null : null);
      message.success(res.message);
    } else {
      message.error(res.message);
    }
  };

  // 提交入口：防串户拦截 + 二次确认（回写宿主系统为不可逆外发操作，须先核对）
  const handleSubmit = () => {
    if (locked) return;
    if (mismatch) {
      message.error('防串户锁定中，禁止提交。请先在病历系统中将活动患者切回本患者以恢复一致。');
      return;
    }
    if (!rendered) return;
    Modal.confirm({
      title: '确认提交至病历系统？',
      width: 360,
      okText: '确认提交',
      cancelText: '再核对一下',
      content: (
        <div className="text-[12px] leading-relaxed">
          <p>
            患者 <b>{patient.name}</b>（住院号 {patient.admissionNo}）的<b>{doc.name}</b>
            将回写至病历系统以下字段：
          </p>
          <ul className="mt-1.5 space-y-0.5 text-slate-600">
            {(template?.fields ?? []).map((f) => (
              <li key={f.key}>· {f.label}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-amber-600">提交后生成版本快照，可在「历史」中查看与对比。</p>
        </div>
      ),
      onOk: () => { doSubmit(); },
    });
  };

  // 跳转至宿主联动建议的下一步文书
  const goNextDoc = () => {
    if (!nextDoc) return;
    selectDoc(nextDoc);
    navigate(`/doc/${nextDoc.code}`);
  };

  // F8 快捷键提交（仅成稿提交步生效，避免前序步骤误触发不可逆外发）
  useHotkey('F8', () => {
    if (!locked && step === 3) handleSubmit();
  });

  return (
    <ParadigmShell
      doc={doc}
      actions={
        <button
          onClick={() => {
            if (versionCount === 0) {
              message.info('提交后才会生成历史版本。');
              return;
            }
            setHistoryOpen(true);
          }}
          title="历史版本与修改记录"
          className={`flex items-center gap-1 text-[11px] font-semibold border rounded-md px-2 py-1 transition-colors ${versionCount === 0
              ? 'text-slate-300 border-slate-200 cursor-not-allowed'
              : 'text-slate-500 hover:text-[#1E3A8A] border-slate-200 hover:border-[#1E3A8A]'
            }`}
        >
          <HistoryOutlined />
          历史{versionCount > 0 ? `(${versionCount})` : ''}
        </button>
      }
    >
      <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC]">
        <WorkflowStepper steps={STEPS} current={step} onChange={setStep} maxReached={maxStep} />

        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          <MeltdownAlert
            visible={mismatch}
            text={`宿主病历系统活动患者已切换，与当前问诊患者「${patient.name}」不一致！防串户锁已锁定，禁止提交。请在病历系统中将活动患者切回本患者以恢复。`}
          />

          {/* 患者上下文 */}
          <section className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm font-extrabold ${mismatch ? 'text-rose-600' : 'text-slate-800'}`}>{patient.name}</span>
                <span className="text-[11px] font-semibold text-slate-500">{patient.gender} / {patient.age} · {patient.bed}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">在院中</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">住院号 {patient.admissionNo} · 入院诊断：<span className="text-[#1E3A8A] font-semibold">{patient.diagnosis}</span></p>
          </section>

          {savedAt && (
            <div className="text-[10px] text-slate-400 text-right -mt-1.5">草稿已自动保存于 {fmtTime(savedAt)}</div>
          )}

          {/* ============ STEP 1 要素填写（客观数据自动集成 + 结构化要素，主诉/现病史可选口述） ============ */}
          {step === 1 && (
            <div className="space-y-3.5 animate-fade-in">
              {/* LIS/PACS 客观数据自动集成（只读依据，无需录入） */}
              <section className="bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="flex justify-between items-center mb-2.5 text-xs font-bold text-slate-600">
                  <span>LIS 检验 · PACS 影像客观报告</span>
                  <span className="text-[10px] text-emerald-600">● 已自动集成</span>
                </div>
                <div className="space-y-2.5">
                  {objective.map((o) => (
                    <div key={o.name} className={`rounded-lg border p-2.5 text-xs space-y-1 ${o.danger ? 'border-[#FECDD3] bg-[#FFF5F5]' : 'border-slate-200 bg-[#F8FAFC]'}`}>
                      <div className="flex justify-between font-bold text-slate-600">
                        <span>{o.name}</span>
                        <span style={{ color: o.statusColor }}>{o.status}</span>
                      </div>
                      <div className="text-[13px] font-bold flex items-baseline gap-1.5 flex-wrap">
                        <span style={{ color: o.valueColor }}>{o.value}</span>
                        {o.ref && <span className="text-[11px] font-normal text-slate-400">{o.ref}</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-relaxed">{o.desc}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 结构化要素填写：选项点选 / 手输为主；叙述病史可一次语音口述自动填入 */}
              <div className="bg-[#FFFDF5] border-[1.5px] border-[#FDE047] rounded-xl p-3.5 space-y-3.5">
                <div className="text-xs font-bold text-[#854D0E] flex items-center gap-1.5 border-b border-[#FEF08A] pb-1.5">
                  病历要素填写（点选 / 手输；叙述病史可语音口述）
                </div>
                {dictateFields.length > 0 && <DictationPanel count={dictateFields.length} onApply={applyDictation} />}
                {elementFields.map((f) => (
                  <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => setVal(f.key, v)} optimize={optimizeText} />
                ))}
                <button onClick={() => goStep(2)} className="w-full bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-bold py-2 rounded-lg transition-colors">
                  确认要素，进入诊断质控
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 2 诊断质控 ============ */}
          {step === 2 && (
            <div className="space-y-3.5 animate-fade-in">
              {/* 关键客观依据（携带 Step1 危急值，诊断/质控就地可见，无需回退查看） */}
              {objective.some((o) => o.danger) && (
                <div className="bg-[#FFF5F5] border border-[#FECDD3] rounded-lg p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#B91C1C]">关键客观依据</div>
                  {objective
                    .filter((o) => o.danger)
                    .map((o) => (
                      <div key={o.name} className="flex justify-between items-baseline text-[11px] gap-2">
                        <span className="text-slate-600">{o.name.split(' · ')[0]}</span>
                        <span className="font-bold shrink-0" style={{ color: o.valueColor }}>
                          {o.value} <span className="font-normal text-slate-400">{o.status}</span>
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-[#166534]">
                  <span>{icdField?.label ?? 'ICD-10 诊断'} · 勾选采纳</span>
                </div>
                {icdItems.map((d, i) => {
                  const checked = acceptedIcd.some((x) => x.code === d.code);
                  return (
                    <label key={d.code} className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded-md border border-slate-200 cursor-pointer">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <input type="checkbox" checked={checked} onChange={() => toggleIcd(d)} className="accent-[#10B981] cursor-pointer" />
                        {i + 1}. {d.name}
                        <span className="font-mono bg-[#ECFDF5] text-[#15803d] px-1 rounded">{d.code}</span>
                      </span>
                      <span className="text-[#166534]">匹配度 {d.confidence}%</span>
                    </label>
                  );
                })}
              </div>
              {treatmentPlanField && (
                <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center text-[11px] font-bold text-[#6D28D9]">
                    <span>{treatmentPlanField.label} · 诊断确认后生成</span>
                    <button
                      onClick={generateTreatmentPlan}
                      disabled={generatingPlan}
                      className="text-[10px] font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] disabled:opacity-60 px-2.5 py-1 rounded-md transition-colors"
                    >
                      {generatingPlan ? '生成中...' : 'AI生成诊疗计划'}
                    </button>
                  </div>
                  <textarea
                    value={treatmentPlan}
                    onChange={(e) => setVal(treatmentPlanField.key, e.target.value)}
                    placeholder={treatmentPlanField.placeholder}
                    rows={4}
                    className="w-full text-[11px] text-slate-700 bg-white border border-[#DDD6FE] rounded-md px-2.5 py-1.5 leading-relaxed outline-none resize-none focus:border-[#6D28D9]"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">AI只根据已确认诊断和客观依据生成建议，医生可直接修改；不确认则不会进入成稿。</p>
                </div>
              )}
              {qc && <QcAuditBox grade={qc.grade} score={qc.score} bubbles={qc.bubbles} />}
              <button onClick={() => goStep(3)} className="w-full bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-bold py-2 rounded-lg transition-colors">
                生成成稿
              </button>
            </div>
          )}

          {/* ============ STEP 3 成稿提交（按 section 分段编辑 + 通读全文预览） ============ */}
          {step === 3 && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                <span>入院记录草稿 · 请核对</span>
                <button onClick={() => setPreviewMode((p) => !p)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1E3A8A] hover:underline">
                  {previewMode ? <ArrowLeftOutlined /> : <ExpandAltOutlined />}
                  {previewMode ? '分段编辑' : '通读全文'}
                </button>
              </div>

              {previewMode ? (
                /* 通读全文：正式病历式只读终审视图，提交内容仍使用 finalContent */
                <div className="bg-white border border-slate-200 rounded-xl p-4 min-h-[160px] shadow-sm">
                  <div className="text-center border-b border-slate-200 pb-2 mb-3">
                    <div className="text-sm font-extrabold text-slate-800">入院记录</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">通读预览 · 请核对完整正文</div>
                  </div>
                  <div className="space-y-3">
                    {finalSections.map((s) => (
                      <section key={s.section} className="text-[12px] leading-relaxed">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-1 h-3 rounded-full bg-[#1E3A8A]" />
                          <span className="font-bold text-[#1E3A8A]">{s.section}</span>
                          {s.section === '患者基本信息' && <span className="text-[9px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] rounded px-1">HIS同步</span>}
                          {s.edited && <span className="text-[9px] text-[#854D0E] bg-[#FFFBEB] border border-[#FEF3C7] rounded px-1">已修改</span>}
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap pl-2.5 border-l border-slate-100">{s.text || '未填写'}</p>
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                /* 分段编辑：字段卡片式排版，每段可编辑可划词 */
                <div className="bg-[#FFFDF5] border-[1.5px] border-[#FDE047] rounded-xl p-3.5 min-h-[160px] space-y-3">
                  {!locked && (
                    <div className="text-[#854D0E] text-[10px] leading-relaxed border-b border-[#FEF08A] pb-1.5">每段可直接编辑、选中文字可优化；改动后可「重置本段」回到要素生成内容</div>
                  )}
                  {finalSections.map((s) => (
                    <SectionEditor
                      key={`${s.section}-${resetKeys[s.section] ?? 0}`}
                      section={s.section}
                      text={s.text}
                      edited={s.edited}
                      locked={locked || s.section === '患者基本信息'}
                      readOnlyHint={s.section === '患者基本信息' ? 'HIS同步' : undefined}
                      onChange={(t) => editSection(s.section, t)}
                      onReset={() => resetSection(s.section)}
                      optimize={optimizeText}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 提交后宿主联动：一键进入建议的下一步文书 */}
        {locked && nextDoc && (
          <div className="px-5 py-2.5 bg-[#F0FDF4] border-t border-emerald-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-emerald-700">已提交 · 建议下一步：{nextDoc.name}</span>
            <button
              onClick={goNextDoc}
              className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md transition-colors shrink-0"
            >
              去写{nextDoc.name}
              <ArrowRightOutlined />
            </button>
          </div>
        )}

        {/* 唯一出口：提交至宿主病历系统 */}
        <WritebackTargetBar docCode={doc.code} docName={doc.name} patientId={patient.admissionNo} />
        <WritebackBar
          label="提交至病历系统 (F8)"
          onWriteback={handleSubmit}
          locked={locked}
          onUnlock={() => {
            setLocked(false);
            message.info('已解除锁定，可重新编辑后再次提交。');
          }}
        />

        <VersionHistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          docCode={doc.code}
          patientId={patient.admissionNo}
        />
      </div>
    </ParadigmShell>
  );
}
