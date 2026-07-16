import type {
  RuntimeEvidenceBundleDto,
  RuntimeEvidenceItemDto,
  RuntimeEvidenceWritebackMode,
  RuntimeFieldCompletionResponse,
} from './pluginRuntimeTypes';
import { stripEvidenceCitationMarkers } from './fieldAssist/evidenceCitations';

export { stripEvidenceCitationMarkers } from './fieldAssist/evidenceCitations';

const WRITEBACK_MODES: RuntimeEvidenceWritebackMode[] = ['fill', 'append', 'overwrite'];

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
