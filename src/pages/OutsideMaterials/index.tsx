import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import {
  ArrowLeftOutlined,
  CloseOutlined,
  EyeOutlined,
  FileTextOutlined,
  LoadingOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  listOcrRecords,
  recognizeOcrImage,
  type BizOcrResultVo,
  type OcrRecognizeResult,
} from '../../services/pluginRuntime';
import { usePatientStore } from '../../stores/usePatientStore';

const OCR_BIZ_TYPE = 'external_material';
const PAGE_SIZE = 10;

const T = {
  back: '返回',
  upload: '上传资料',
  uploading: '识别中...',
  patient: '当前患者',
  noPatient: '未选择患者',
  patientHint: '请先在患者列表中选择患者',
  bed: '床位',
  inpatientNo: '住院号',
  diagnosis: '诊断',
  admissionDate: '入院时间',
  doctor: '管床医生',
  dept: '科室',
  outsideMaterials: '外院资料',
  subtitle: '上传后自动识别，确认后可作为病历材料',
  countPrefix: '共',
  countSuffix: '份',
  emptyTitle: '暂无外院资料',
  emptyText: '点击右上角上传图片，系统将自动进行 OCR 识别',
  loadFailed: '外院资料加载失败',
  uploadSuccess: '图片 OCR 识别完成',
  uploadFailed: '图片 OCR 识别失败',
  invalidFile: '请上传 jpg、jpeg、png 或 bmp 格式图片',
  selectPatientBeforeUpload: '请先选择患者后再上传外院资料',
  success: '识别完成',
  failed: '识别失败',
  recognizing: '识别中',
  unknownFile: '未命名图片',
  unknown: '未记录',
  mode: '引擎',
  time: '时间',
  blocks: '文本块',
  cost: '耗时',
  size: '大小',
  view: '查看',
  detail: '识别详情',
  originalImage: '原图',
  fullText: '识别全文',
  errorReason: '失败原因',
  noText: '暂无识别文本',
  prev: '上一页',
  next: '下一页',
  page: '第',
  pageSuffix: '页',
};

const LAB_T = {
  reportInfo: '报告信息',
  testItems: '检验项目',
  originalText: '原始识别文本',
  seq: '序号',
  code: '代码',
  itemName: '项目名称',
  result: '结果',
  unit: '单位',
  reference: '参考值',
};

function isAllowedImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|bmp)$/.test(name);
}

function formatDate(value?: string): string {
  if (!value) return T.unknown;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatFileSize(value?: number): string {
  if (!value || value <= 0) return T.unknown;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatCost(value?: number): string {
  if (!value || value <= 0) return T.unknown;
  return `${value} ms`;
}

interface LabMetaItem {
  label: string;
  value: string;
}

interface LabReportItem {
  seq?: string;
  code: string;
  name: string;
  result: string;
  unit: string;
  reference: string;
  abnormal: boolean;
}

interface ParsedLabReport {
  title: string;
  subtitle?: string;
  meta: LabMetaItem[];
  items: LabReportItem[];
  rawText: string;
}

const META_LABELS = new Set([
  '姓名',
  '病案',
  '费别',
  '标本编号',
  '性别',
  '申请科室',
  '送检医师',
  '条码编号',
  '年龄',
  '床号',
  '标本种类',
  '临床诊断',
  '接收时间',
  '报告时间',
  '检验者',
  '审核者',
  '备注',
]);

const BLOOD_ROUTINE_SEQ: Record<string, string> = {
  HCT: '4',
  MCHC: '7',
};

function cleanOcrLines(text?: string): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isHeaderLine(line: string): boolean {
  return [
    '序号代码',
    '项目名称',
    '结果',
    '单位',
    '参考值',
  ].includes(line);
}

function isCodeToken(token?: string): boolean {
  return Boolean(token && /^[A-Za-z][A-Za-z0-9-]*$/.test(token));
}

function splitRowStart(token: string): { seq: string; code?: string } | null {
  const spaced = /^(\d{1,2})\s+([A-Za-z][A-Za-z0-9-]*)$/.exec(token);
  if (spaced) return { seq: spaced[1], code: spaced[2] };
  const attached = /^(\d{1,2})([A-Za-z][A-Za-z0-9-]*)$/.exec(token);
  if (attached) return { seq: attached[1], code: attached[2] };
  return /^\d{1,2}$/.test(token) ? { seq: token } : null;
}

function isRowStartAt(tokens: string[], index: number): boolean {
  const start = splitRowStart(tokens[index]);
  if (start?.code) return true;
  return Boolean(start && isCodeToken(tokens[index + 1]));
}

function isCodeOnlyStartAt(tokens: string[], index: number): boolean {
  const token = tokens[index];
  const next = tokens[index + 1];
  return isCodeToken(token) && Boolean(next) && /[\u4e00-\u9fff]/.test(next) && !isHeaderLine(next) && !isResultToken(next);
}

function isResultToken(token: string): boolean {
  return /^[\u2191\u2193+-]?\d+(?:\.\d+)?$/.test(token);
}

function isUnitToken(token?: string): boolean {
  return Boolean(token && /^(?:%|g\/L|fL|pg|10(?:\^?\d+|\d*)\/L)$/i.test(token));
}

function splitCombinedNameResult(token: string): string[] {
  const match = /^(.+?)([\u2191\u2193+-]?\d+(?:\.\d+)?)$/.exec(token);
  if (!match || !/[\u4e00-\u9fff]/.test(match[1])) return [token];
  return [match[1], match[2]];
}

function parseLabSegment(segment: string[]): LabReportItem | null {
  if (!segment.length) return null;
  let cursor = 0;
  let seq: string | undefined;
  let code = '';
  const start = splitRowStart(segment[0]);
  if (start) {
    seq = start.seq;
    code = start.code ?? '';
    cursor = 1;
  }
  if (!code && isCodeToken(segment[cursor])) {
    code = segment[cursor];
    cursor += 1;
  }
  if (!code) return null;
  seq = seq ?? BLOOD_ROUTINE_SEQ[code.toUpperCase()];

  const body = segment
    .slice(cursor)
    .filter((token) => !isHeaderLine(token))
    .flatMap(splitCombinedNameResult);
  const resultIndex = body.findIndex(isResultToken);
  if (resultIndex < 1) return null;

  const afterResult = body.slice(resultIndex + 1);
  const unit = isUnitToken(afterResult[0]) ? afterResult[0] : '';
  const reference = unit ? afterResult.slice(1).join(' ') : afterResult.join(' ');
  const result = body[resultIndex];
  return {
    seq,
    code,
    name: body.slice(0, resultIndex).join(''),
    result,
    unit,
    reference,
    abnormal: /^[\u2191\u2193+-]/.test(result) || /^[\u2191\u2193]/.test(reference),
  };
}

function parseLabItems(lines: string[]): LabReportItem[] {
  const tokens = lines.filter((line) => !isHeaderLine(line));
  const segments: string[][] = [];
  let current: string[] = [];

  tokens.forEach((token, index) => {
    const startsRow = isRowStartAt(tokens, index) || isCodeOnlyStartAt(tokens, index);
    if (startsRow && current.length) {
      segments.push(current);
      current = [];
    }
    current.push(token);
  });
  if (current.length) segments.push(current);

  return segments
    .map(parseLabSegment)
    .filter((item): item is LabReportItem => Boolean(item))
    .sort((a, b) => Number(a.seq ?? 999) - Number(b.seq ?? 999));
}

function parseMetaLines(lines: string[]): LabMetaItem[] {
  const items: LabMetaItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (line.length === 1 && lines[index + 1]) {
      const merged = `${line}${lines[index + 1]}`;
      if (/^[\u4e00-\u9fff]{2,6}[：:]/.test(merged)) {
        line = merged;
        index += 1;
      }
    }
    const match = /^(.{1,8}?)[：:]\s*(.*)$/.exec(line);
    if (!match || !META_LABELS.has(match[1])) continue;
    let value = match[2].trim();
    const next = lines[index + 1];
    const nextPair = next && lines[index + 2] ? `${next}${lines[index + 2]}` : '';
    const nextStartsSplitLabel = /^[\u4e00-\u9fff]{2,6}[：:]/.test(nextPair);
    if (!value && next && !nextStartsSplitLabel && !/^[\u4e00-\u9fff]{1,8}[：:]/.test(next) && !isHeaderLine(next)) {
      value = next;
      index += 1;
    }
    if (value) items.push({ label: match[1], value });
  }
  return items;
}

function parseLabReport(text?: string): ParsedLabReport | null {
  const lines = cleanOcrLines(text);
  if (!lines.length) return null;

  const tableStart = lines.findIndex((line) => line.includes('\u5e8f\u53f7\u4ee3\u7801') || line === '\u9879\u76ee\u540d\u79f0');
  if (tableStart < 0) return null;

  const tableEndOffset = lines
    .slice(tableStart)
    .findIndex((line) => /^(?:接收时间|报告时间|检验者|审核者|备注|此结果)/.test(line));
  const tableEnd = tableEndOffset < 0 ? lines.length : tableStart + tableEndOffset;
  const items = parseLabItems(lines.slice(tableStart, tableEnd));
  if (items.length < 3) return null;

  const beforeTable = lines.slice(0, tableStart);
  const afterTable = lines.slice(tableEnd);
  return {
    title: beforeTable[0] ?? T.fullText,
    subtitle: beforeTable.find((line, index) => index > 0 && /^\[.+\]$/.test(line)),
    meta: parseMetaLines([...beforeTable.slice(1), ...afterTable]),
    items,
    rawText: text ?? '',
  };
}

function getStatusMeta(status?: string) {
  const value = String(status ?? '').toLowerCase();
  if (value === 'success' || value === 'done' || value === 'completed') {
    return {
      label: T.success,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (value === 'failed' || value === 'fail' || value === 'error') {
    return {
      label: T.failed,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  return {
    label: T.recognizing,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  };
}

function toRecord(result: OcrRecognizeResult, bizId?: string): BizOcrResultVo {
  return {
    id: result.ocrId,
    bizType: OCR_BIZ_TYPE,
    bizId,
    fileName: result.fileName,
    fileUrl: result.fileUrl,
    ocrMode: result.engine,
    ocrText: result.text,
    blockCount: result.blocks?.length,
    costMs: result.costMs,
    status: result.status,
    createTime: new Date().toISOString(),
  };
}

export default function OutsideMaterials() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentPatient = usePatientStore((state) => state.currentPatient);
  const [records, setRecords] = useState<BizOcrResultVo[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<BizOcrResultVo | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const pagedRecords = useMemo(() => {
    const start = (pageNum - 1) * PAGE_SIZE;
    return records.slice(start, start + PAGE_SIZE);
  }, [pageNum, records]);

  const loadRecords = useCallback(async (): Promise<BizOcrResultVo[]> => {
    if (!currentPatient) {
      setRecords([]);
      setTotal(0);
      return [];
    }

    setLoading(true);
    try {
      const result = await listOcrRecords({
        bizType: OCR_BIZ_TYPE,
        bizId: currentPatient.id,
      });
      setRecords(result.rows);
      setTotal(result.total);
      return result.rows;
    } catch (error) {
      message.error(error instanceof Error ? error.message : T.loadFailed);
      setRecords([]);
      setTotal(0);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentPatient]);

  useEffect(() => {
    setPageNum(1);
    void loadRecords();
  }, [loadRecords]);

  const openUploadPicker = () => {
    if (!currentPatient) {
      message.warning(T.selectPatientBeforeUpload);
      return;
    }
    inputRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    if (!isAllowedImage(file)) {
      message.warning(T.invalidFile);
      return;
    }
    if (!currentPatient) {
      message.warning(T.selectPatientBeforeUpload);
      return;
    }

    setUploading(true);
    try {
      const result = await recognizeOcrImage(file, {
        bizType: OCR_BIZ_TYPE,
        bizId: currentPatient.id,
        engine: 'baidu',
      });
      message.success(T.uploadSuccess);
      setPageNum(1);
      const refreshedRecords = await loadRecords();
      const uploadedRecord = refreshedRecords.find((record) => record.id === result.ocrId);
      setDetail(uploadedRecord ?? toRecord(result, currentPatient.id));
    } catch (error) {
      message.error(error instanceof Error ? error.message : T.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const openDetail = (record: BizOcrResultVo) => {
    setDetail(record);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleUpload(file);
  };

  const goPage = (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), totalPages);
    setPageNum(safePage);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F6F8FB]">
      <div className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            onClick={() => navigate('/', { replace: true })}
            type="button"
          >
            <ArrowLeftOutlined />
            {T.back}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A8A] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploading}
            onClick={openUploadPicker}
            type="button"
          >
            {uploading ? <LoadingOutlined className="animate-spin" /> : <UploadOutlined />}
            {uploading ? T.uploading : T.upload}
          </button>
          <input
            ref={inputRef}
            accept=".jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp"
            className="hidden"
            onChange={handleFileChange}
            type="file"
          />
        </div>

        <section className="rounded-lg border border-blue-100 bg-white px-3 py-3 shadow-sm">
          <div className="flex min-h-[58px] items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold leading-4 text-[#37547A]">{T.patient}</p>
              {currentPatient ? (
                <div className="mt-1 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="truncate text-[15px] font-extrabold leading-5 text-slate-950">
                      {currentPatient.name}
                    </span>
                    <span className="text-[12px] font-semibold leading-5 text-[#52657D]">
                      {currentPatient.gender} / {currentPatient.age}
                    </span>
                    <span className="text-[12px] font-semibold leading-5 text-[#52657D]">
                      {T.bed} {currentPatient.bedNo || T.unknown}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-medium leading-4 text-[#52657D]">
                    {T.inpatientNo} {currentPatient.id} <span className="text-slate-300">{'\u00b7'}</span> {T.diagnosis}
                    {currentPatient.diagnosis || T.unknown}
                  </p>
                </div>
              ) : (
                <div className="mt-1 min-w-0">
                  <p className="text-[15px] font-extrabold leading-5 text-slate-950">{T.noPatient}</p>
                  <p className="mt-1 truncate text-[11px] font-medium leading-4 text-[#52657D]">{T.patientHint}</p>
                </div>
              )}
            </div>
            <button
              aria-label={T.outsideMaterials}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-white text-[#37547A] shadow-sm hover:border-[#1E3A8A] hover:text-[#1E3A8A] disabled:opacity-50"
              disabled={loading}
              onClick={() => void loadRecords()}
              title={T.outsideMaterials}
              type="button"
            >
              {loading ? <LoadingOutlined className="animate-spin" /> : <ReloadOutlined />}
            </button>
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">{T.outsideMaterials}</h2>
              <p className="mt-1 text-[11px] text-slate-500">{T.subtitle}</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
              {T.countPrefix} {total} {T.countSuffix}
            </span>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400 shadow-sm">
                <LoadingOutlined className="mr-2 animate-spin" />
                {T.recognizing}
              </div>
            ) : pagedRecords.length ? (
              pagedRecords.map((record) => (
                <MaterialCard
                  key={record.id ?? `${record.fileName}-${record.createTime}`}
                  record={record}
                  onView={() => openDetail(record)}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-sm">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                  <FileTextOutlined />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-700">{T.emptyTitle}</p>
                <p className="mt-1 text-[11px] text-slate-400">{T.emptyText}</p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pageNum <= 1 || loading}
                onClick={() => goPage(pageNum - 1)}
                type="button"
              >
                {T.prev}
              </button>
              <span className="text-[11px] font-medium text-slate-400">
                {T.page} {pageNum} / {totalPages} {T.pageSuffix}
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pageNum >= totalPages || loading}
                onClick={() => goPage(pageNum + 1)}
                type="button"
              >
                {T.next}
              </button>
            </div>
          )}
        </section>
      </div>

      {detail ? <DetailModal record={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-medium text-slate-400">{label}</span>
      <span className="mt-1 block truncate text-xs font-bold text-slate-700">{value || T.unknown}</span>
    </div>
  );
}

function MaterialCard({
  record,
  onView,
}: {
  record: BizOcrResultVo;
  onView: () => void;
}) {
  const status = getStatusMeta(record.status);
  const summary = record.status === 'failed'
    ? record.errorMsg || T.errorReason
    : record.ocrText || T.noText;

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-[#1E3A8A]">
          <FileTextOutlined />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-slate-900">
                {record.fileName || T.unknownFile}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                <span>{T.mode}: {record.ocrMode || T.unknown}</span>
                <span>{T.time}: {formatDate(record.createTime)}</span>
                <span>{T.blocks}: {record.blockCount ?? 0}</span>
                <span>{T.cost}: {formatCost(record.costMs)}</span>
              </div>
            </div>
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[11px] leading-5 text-slate-500">{summary}</p>
            <button
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-500 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
              onClick={onView}
              title={T.view}
              type="button"
            >
              <EyeOutlined />
              {T.view}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function OcrTextView({ text }: { text?: string }) {
  const report = parseLabReport(text);

  if (!report) {
    return (
      <div className="min-h-[180px] rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-6 text-slate-600">
        <pre className="whitespace-pre-wrap break-words font-sans">{text || T.noText}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-extrabold text-slate-900">{report.title}</h4>
            {report.subtitle ? (
              <p className="mt-1 text-[11px] font-medium text-slate-500">{report.subtitle}</p>
            ) : null}
          </div>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#1E3A8A]">
            {LAB_T.testItems} {report.items.length}
          </span>
        </div>

        {report.meta.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            {report.meta.slice(0, 8).map((item) => (
              <InfoCell key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-xs font-extrabold text-slate-900">
          {LAB_T.testItems}
        </div>
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2">{LAB_T.seq}</th>
                <th className="w-20 px-3 py-2">{LAB_T.code}</th>
                <th className="px-3 py-2">{LAB_T.itemName}</th>
                <th className="w-20 px-3 py-2">{LAB_T.result}</th>
                <th className="w-20 px-3 py-2">{LAB_T.unit}</th>
                <th className="w-28 px-3 py-2">{LAB_T.reference}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.items.map((item, index) => (
                <tr
                  key={`${item.seq ?? index}-${item.code}-${item.name}`}
                  className={item.abnormal ? 'bg-rose-50/60' : undefined}
                >
                  <td className="px-3 py-2 font-medium text-slate-400">{item.seq || '-'}</td>
                  <td className="px-3 py-2 font-bold text-[#1E3A8A]">{item.code}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{item.name}</td>
                  <td className={`px-3 py-2 font-extrabold ${item.abnormal ? 'text-rose-600' : 'text-slate-900'}`}>
                    {item.result}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{item.unit || '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{item.reference || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-xs font-extrabold text-slate-700">
          {LAB_T.originalText}
        </summary>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 p-3 font-sans text-[12px] leading-6 text-slate-500">
          {report.rawText}
        </pre>
      </details>
    </div>
  );
}

function DetailModal({ record, onClose }: { record: BizOcrResultVo; onClose: () => void }) {
  const status = getStatusMeta(record.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">{T.detail}</h2>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${status.className}`}>
                {status.label}
              </span>
            </div>
            <p className="truncate text-xs text-slate-500">{record.fileName || T.unknownFile}</p>
          </div>
          <button
            aria-label="close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <CloseOutlined />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
            {/* <InfoCell label={T.mode} value={record.ocrMode} /> */}
            <InfoCell label={T.time} value={formatDate(record.createTime)} />
            <InfoCell label={T.blocks} value={record.blockCount ?? 0} />
            <InfoCell label={T.cost} value={formatCost(record.costMs)} />
            <InfoCell label={T.size} value={formatFileSize(record.fileSize)} />
            {/* <InfoCell label={T.inpatientNo} value={record.bizId} /> */}
          </div>
{/* 
          {record.fileUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#1E3A8A] hover:bg-blue-50"
              href={record.fileUrl}
              rel="noreferrer"
              target="_blank"
            >
              <FileTextOutlined />
              {T.originalImage}
            </a>
          ) : null} */}

          {record.errorMsg ? (
            <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <p className="text-xs font-bold text-rose-700">{T.errorReason}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-rose-600">{record.errorMsg}</p>
            </div>
          ) : null}

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-extrabold text-slate-900">{T.fullText}</h3>
            <OcrTextView text={record.ocrText} />
          </div>
        </div>
      </div>
    </div>
  );
}
