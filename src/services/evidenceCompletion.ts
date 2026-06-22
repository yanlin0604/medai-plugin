import type {
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceItemDto,
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from './pluginRuntimeTypes';

const WRITEBACK_MODES: RuntimeEvidenceWritebackMode[] = ['fill', 'append', 'overwrite'];
const CITATION_MARKER_PATTERN = /\s*[\[【][a-zA-Z0-9\-_,，\s]+[\]】]\s*/g;

export function isRuntimeEvidenceWritebackMode(value: unknown): value is RuntimeEvidenceWritebackMode {
  return typeof value === 'string' && WRITEBACK_MODES.includes(value as RuntimeEvidenceWritebackMode);
}

export function normalizeEvidenceWritebackMode(
  value: unknown,
  fallback: RuntimeEvidenceWritebackMode = 'append',
): RuntimeEvidenceWritebackMode {
  return isRuntimeEvidenceWritebackMode(value) ? value : fallback;
}

export function resolveDefaultSelectedEvidenceIds(bundle?: RuntimeEvidenceBundleDto | null): string[] {
  if (!bundle?.evidenceItems?.length) return [];
  const selected = new Set<string>();
  bundle.evidenceItems.forEach((item) => {
    if (item.evidenceId?.trim()) {
      selected.add(item.evidenceId);
    }
  });
  return [...selected];
}

export function resolveCompletionWritebackMode(
  response?: Pick<RuntimeFieldCompletionResponse, 'recommendedWritebackMode'> | null,
  currentText = '',
): RuntimeEvidenceWritebackMode {
  const fallback: RuntimeEvidenceWritebackMode = currentText.trim() ? 'append' : 'fill';
  return normalizeEvidenceWritebackMode(response?.recommendedWritebackMode, fallback);
}

export function stripEvidenceCitationMarkers(text: string): string {
  return text
    .replace(CITATION_MARKER_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyFieldCompletionText(
  currentText: string,
  generatedText: string,
  mode: RuntimeEvidenceWritebackMode,
): string {
  const normalizedMode = normalizeEvidenceWritebackMode(mode);
  const current = currentText.trim();
  const generated = stripEvidenceCitationMarkers(generatedText);

  if (!generated) return current;
  if (normalizedMode === 'fill' || normalizedMode === 'overwrite') return generated;
  if (!current) return generated;
  return `${current}\n${generated}`;
}

export function hasUsableEvidence(evidenceItems?: RuntimeEvidenceItemDto[] | null): boolean {
  return Boolean(evidenceItems?.some((item) => item.evidenceId?.trim()));
}
