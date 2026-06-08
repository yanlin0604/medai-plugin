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

  return (
    <article className="max-w-5xl mx-auto px-8 py-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-bold text-slate-900">{docName}</h1>
        {actions && <div className="absolute right-0 top-1/2 -translate-y-1/2">{actions}</div>}
      </div>

      <div className="mb-6 text-sm border-2 border-slate-300">
        {rows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className={`grid grid-cols-12 ${rowIndex < rows.length - 1 ? 'border-b border-slate-300' : ''}`}
          >
            {row.map((cell, cellIndex) => {
              const last = cellIndex === row.length - 1;
              return (
                <div key={`${cell.label}-${cellIndex}`} className="contents">
                  <div className="col-span-2 border-r border-slate-300 px-3 py-2 bg-slate-50 font-bold">
                    {cell.label}
                  </div>
                  <div
                    className={`col-span-2 px-3 py-2 min-w-0 break-words ${last ? '' : 'border-r border-slate-300'}`}
                  >
                    {cell.value}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={bodyClassName}>{children}</div>
    </article>
  );
}

/**
 * 纸质病历预览：标题、患者信息表格和正文段落共用结构。
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
      bodyClassName="space-y-4 text-sm leading-7"
    >
      {sections.map((section) => (
        <section key={section.key}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-bold text-slate-900">{section.title}：</span>
            {section.required && !section.text.trim() && (
              <span className="text-[11px] font-semibold text-amber-600">必填</span>
            )}
          </div>
          <div className="text-slate-700 whitespace-pre-wrap pl-4 leading-relaxed break-words">
            {section.text || emptyText}
          </div>
        </section>
      ))}
    </DocumentPaperFrame>
  );
}
