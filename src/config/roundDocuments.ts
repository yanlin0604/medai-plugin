export const ROUND_RECORD_DOC_CODES = ['DOC003', 'DOC004', 'DOC017'] as const;

export type RoundRecordDocCode = typeof ROUND_RECORD_DOC_CODES[number];

const roundRecordDocCodeSet = new Set<string>(ROUND_RECORD_DOC_CODES);

export function isRoundRecordDocCode(docCode: string): docCode is RoundRecordDocCode {
  return roundRecordDocCodeSet.has(docCode);
}
