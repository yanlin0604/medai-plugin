import type { ReactNode } from 'react';
import type { ClinicalSection, PatientBrief } from '../../services/types';

export interface DocumentPaperMetaCell {
  label: string;
  value: ReactNode;
}

interface Props {
  docName: string;
  patient: PatientBrief;
  sections: ClinicalSection[];
  metaRows?: DocumentPaperMetaCell[][];
  actions?: ReactNode;
  emptyText?: string;
}

export function defaultMetaRows(patient: PatientBrief): DocumentPaperMetaCell[][] {
  return [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位号', value: patient.bed },
      { label: '住院号', value: patient.admissionNo },
      { label: '入院诊断', value: patient.diagnosis ?? '待完善' },
    ],
  ];
}

function isWideMetaCell(cell: DocumentPaperMetaCell) {
  return cell.label.includes('诊断') || cell.label.includes('地址') || cell.label.includes('病情');
}

interface DocumentPaperFrameProps {
  docName: string;
  patient: PatientBrief;
  metaRows?: DocumentPaperMetaCell[][];
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

/**
 * 病历纸张框架：读模式和编辑模式共用标题、患者信息表格和纸面边距。
 */
export function DocumentPaperFrame({
  docName,
  patient,
  metaRows,
  actions,
  children,
  bodyClassName,
}: DocumentPaperFrameProps) {
  const rows = metaRows?.length ? metaRows : defaultMetaRows(patient);
  const cells = rows.flat();

  return (
    <article className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 lg:px-8">
      <div className="min-h-full rounded-sm border border-slate-200 bg-[#FFFEFB] px-4 py-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7 lg:px-10">
      <div className="mb-5 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="hidden sm:block" />
        <div className="min-w-0 text-center">
          <h1 className="text-2xl font-bold text-slate-950">{docName}</h1>
        </div>
        {actions && <div className="flex justify-center sm:justify-end">{actions}</div>}
      </div>

      <div className="mb-6 border-y-2 border-slate-700 py-2 text-sm">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-x-5 gap-y-2">
          {cells.map((cell, cellIndex) => (
            <div
              key={`${cell.label}-${cellIndex}`}
              className={`flex min-w-0 items-baseline gap-2 ${isWideMetaCell(cell) ? 'md:col-span-2 xl:col-span-3' : ''}`}
            >
              <span className="shrink-0 text-[13px] font-semibold text-slate-700">{cell.label}</span>
              <span className="min-w-0 flex-1 border-b border-slate-400 px-1 pb-0.5 text-[13px] font-medium leading-6 text-slate-950 break-words">
                {cell.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={bodyClassName}>{children}</div>
      </div>
    </article>
  );
}

/**
 * 纸质病历预览：标题、患者信息和正文段落共用结构。
 */
export default function DocumentPaper({
  docName,
  patient,
  sections,
  metaRows,
  actions,
  emptyText = '（待填写）',
}: Props) {
  return (
    <DocumentPaperFrame
      docName={docName}
      patient={patient}
      metaRows={metaRows}
      actions={actions}
      bodyClassName="space-y-5 text-[14px] leading-7"
    >
      {sections.map((section) => (
        <section key={section.key} className="break-words">
          <div className="mb-1 flex items-baseline gap-2 border-b border-slate-200 pb-1">
            <span className="font-bold text-slate-950">{section.title}</span>
            {section.required && !section.text.trim() && (
              <span className="text-[11px] font-semibold text-amber-600">必填</span>
            )}
          </div>
          <div className="whitespace-pre-wrap text-slate-800 leading-8 sm:pl-6">
            {section.text || emptyText}
          </div>
        </section>
      ))}
    </DocumentPaperFrame>
  );
}
