import type { ReactNode } from 'react';
import type { ClinicalSection, PatientBrief } from '../../services/types';
import DocumentSectionEditorList, {
  type SectionListOptimize,
} from './DocumentSectionEditorList';
import { DocumentPaperFrame, type DocumentPaperMetaCell } from './DocumentPaper';
import type { SectionOptimize, SectionRewriteStatusHandler } from './SectionEditor';

interface Props {
  docName: string;
  patient: PatientBrief;
  sections: ClinicalSection[];
  metaRows?: DocumentPaperMetaCell[][];
  actions?: ReactNode;
  locked?: boolean;
  density?: 'compact' | 'comfortable';
  sectionEdits?: Record<string, string>;
  resetKeys?: Record<string, number>;
  sectionSuffixes?: Record<string, ReactNode>;
  onChange: (sectionKey: string, text: string) => void;
  onReset: (sectionKey: string) => void;
  onFocusSection?: (sectionKey: string) => void;
  optimize: SectionOptimize;
  optimizeSection?: SectionListOptimize;
  onRewriteStatusChange?: SectionRewriteStatusHandler;
}

/**
 * 纸张式正文编辑：复用病历纸面结构，段落编辑能力仍交给 SectionEditor。
 */
export default function EditableDocumentPaper({
  docName,
  patient,
  sections,
  metaRows,
  actions,
  locked,
  density = 'comfortable',
  sectionEdits,
  resetKeys,
  sectionSuffixes,
  onChange,
  onReset,
  onFocusSection,
  optimize,
  optimizeSection,
  onRewriteStatusChange,
}: Props) {
  return (
    <DocumentPaperFrame
      docName={docName}
      patient={patient}
      metaRows={metaRows}
      actions={actions}
      bodyClassName="text-sm leading-7"
    >
      <DocumentSectionEditorList
        sections={sections}
        locked={locked}
        density={density}
        variant="paper"
        sectionEdits={sectionEdits}
        resetKeys={resetKeys}
        sectionSuffixes={sectionSuffixes}
        onChange={onChange}
        onReset={onReset}
        onFocusSection={onFocusSection}
        optimize={optimize}
        optimizeSection={optimizeSection}
        onRewriteStatusChange={onRewriteStatusChange}
      />
    </DocumentPaperFrame>
  );
}
