import type { RuntimeEvidenceSummaryDto } from '../pluginRuntimeTypes';

const CITATION_TOKEN_PATTERN = /([\[【][a-zA-Z0-9_.:%_,，\s-]+[\]】])/g;
const CITATION_TOKEN_EXACT_PATTERN = /^[\[【][a-zA-Z0-9_.:%_,，\s-]+[\]】]$/;
const CITATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:%-]*$/;
const CITATION_MARKER_PATTERN = /\s*[\[【][a-zA-Z0-9_.:%_,，\s-]+[\]】]\s*/g;

export interface ResolvedEvidenceCitation {
  evidence: RuntimeEvidenceSummaryDto;
  displayNumber: number;
  evidenceId: string;
  evidenceIndex: number;
}

export interface CompositeEvidenceSection {
  itemKey: string;
  itemLabel: string;
  text: string;
  evidenceSummary: RuntimeEvidenceSummaryDto[];
}

export interface CompositeEvidencePreview {
  sections: CompositeEvidenceSection[];
  evidenceSummary: RuntimeEvidenceSummaryDto[];
}

export function splitCitationReferences(token: string): string[] {
  if (!/^[\[【].*[\]】]$/.test(token)) return [];
  return token
    .slice(1, -1)
    .split(/[,，\s]+/)
    .map((value) => value.trim())
    .filter((value) => CITATION_ID_PATTERN.test(value));
}

export function resolveEvidenceCitation(
  reference: string,
  evidenceSummary: readonly RuntimeEvidenceSummaryDto[],
): ResolvedEvidenceCitation | null {
  const normalized = reference.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const index = Number(normalized) - 1;
    const evidence = evidenceSummary[index];
    return evidence
      ? { evidence, displayNumber: index + 1, evidenceId: evidence.evidenceId?.trim() ?? '', evidenceIndex: index }
      : null;
  }
  const index = evidenceSummary.findIndex((item) => item.evidenceId === normalized);
  const evidence = index >= 0 ? evidenceSummary[index] : undefined;
  return evidence?.evidenceId?.trim()
    ? { evidence, displayNumber: index + 1, evidenceId: evidence.evidenceId, evidenceIndex: index }
    : null;
}

export function tokenizeCitationText(text: string): Array<{ type: 'text' | 'citation'; value: string }> {
  return text.split(CITATION_TOKEN_PATTERN).filter(Boolean).map((value) => ({
    type: CITATION_TOKEN_EXACT_PATTERN.test(value) ? 'citation' : 'text',
    value,
  }));
}

function addEvidence(
  evidence: RuntimeEvidenceSummaryDto,
  localIdentity: string,
  globalEvidence: RuntimeEvidenceSummaryDto[],
  indexById: Map<string, number>,
): number {
  const evidenceId = evidence.evidenceId?.trim();
  const identity = evidenceId ? `id:${evidenceId}` : `local:${localIdentity}`;
  const existing = indexById.get(identity);
  if (existing !== undefined) return existing + 1;
  globalEvidence.push(evidence);
  const index = globalEvidence.length - 1;
  indexById.set(identity, index);
  return index + 1;
}

function renumberCompositeText(
  itemKey: string,
  text: string,
  evidenceSummary: readonly RuntimeEvidenceSummaryDto[],
  globalEvidence: RuntimeEvidenceSummaryDto[],
  indexById: Map<string, number>,
): string {
  return text.replace(CITATION_TOKEN_PATTERN, (token) => {
    const references = splitCitationReferences(token);
    if (!references.length) return token;
    const rendered = references.map((reference) => {
      const resolved = resolveEvidenceCitation(reference, evidenceSummary);
      if (!resolved) return reference;
      return String(addEvidence(
        resolved.evidence,
        `${itemKey}:${resolved.evidenceIndex}`,
        globalEvidence,
        indexById,
      ));
    });
    return `[${rendered.join(', ')}]`;
  });
}

export function buildCompositeEvidencePreview(
  items: ReadonlyArray<{
    itemKey: string;
    itemLabel: string;
    text: string;
    evidenceSummary?: readonly RuntimeEvidenceSummaryDto[];
    itemOrder?: number;
  }>,
): CompositeEvidencePreview {
  const globalEvidence: RuntimeEvidenceSummaryDto[] = [];
  const indexById = new Map<string, number>();
  const sections = items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => (a.item.itemOrder ?? a.originalIndex) - (b.item.itemOrder ?? b.originalIndex))
    .map(({ item }) => {
      const evidenceSummary = item.evidenceSummary ? [...item.evidenceSummary] : [];
      return {
        itemKey: item.itemKey,
        itemLabel: item.itemLabel,
        text: renumberCompositeText(item.itemKey, item.text, evidenceSummary, globalEvidence, indexById),
        evidenceSummary,
      };
    });
  return { sections, evidenceSummary: globalEvidence };
}

export function stripEvidenceCitationMarkers(text: string): string {
  return text
    .replace(CITATION_MARKER_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
