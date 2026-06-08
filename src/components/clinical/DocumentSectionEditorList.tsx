import type { ReactNode } from 'react';
import type { ClinicalSection } from '../../services/types';
import SectionEditor, { type SectionEditorVariant } from './SectionEditor';

interface Props {
  sections: ClinicalSection[];
  locked?: boolean;
  density?: 'compact' | 'comfortable';
  variant?: SectionEditorVariant;
  sectionEdits?: Record<string, string>;
  resetKeys?: Record<string, number>;
  readOnlyHints?: Record<string, string>;
  sectionSuffixes?: Record<string, ReactNode>;
  onChange: (sectionKey: string, text: string) => void;
  onReset: (sectionKey: string) => void;
  optimize: (text: string, mode: string) => string;
}

/**
 * 段落编辑列表：统一把 ClinicalSection 映射为 SectionEditor。
 */
export default function DocumentSectionEditorList({
  sections,
  locked,
  density = 'comfortable',
  variant = 'card',
  sectionEdits,
  resetKeys,
  readOnlyHints,
  sectionSuffixes,
  onChange,
  onReset,
  optimize,
}: Props) {
  const listClass = variant === 'paper' ? 'divide-y divide-slate-200/80' : 'space-y-3';

  return (
    <div className={listClass}>
      {sections.map((section) => {
        const edited = sectionEdits?.[section.key] != null || sectionEdits?.[section.title] != null;
        const text = sectionEdits?.[section.key] ?? sectionEdits?.[section.title] ?? section.text;
        const readOnlyHint = readOnlyHints?.[section.key] ?? readOnlyHints?.[section.title];
        const sectionSuffix = sectionSuffixes?.[section.key] ?? sectionSuffixes?.[section.title];

        return (
          <SectionEditor
            key={`${section.key}-${resetKeys?.[section.key] ?? 0}`}
            section={section.title}
            text={text}
            edited={edited}
            locked={locked || !section.editable}
            readOnlyHint={readOnlyHint}
            sectionSuffix={sectionSuffix}
            density={density}
            variant={variant}
            onChange={(next) => onChange(section.key, next)}
            onReset={() => onReset(section.key)}
            optimize={optimize}
          />
        );
      })}
    </div>
  );
}
