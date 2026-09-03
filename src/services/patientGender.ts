export function normalizePatientGender(value: unknown): string {
  if (value == null) return '';

  const text = String(value).trim();
  const normalized = text.toUpperCase();

  if (normalized === 'MALE') return '男';
  if (normalized === 'FEMALE') return '女';

  return text;
}
