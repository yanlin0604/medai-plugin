import type {
  RuntimeFieldCompositionItemDto,
  RuntimeFieldCompositionTemplateDto,
} from '../../services/pluginRuntimeTypes';

export const DEFAULT_COMPOSITION_LINE_TEMPLATE = '{{index}}. {{label}}：{{value}}';

export interface CompositionParseResult {
  values: Record<string, string>;
  complete: boolean;
  warnings: string[];
}

export function sortedCompositionItems(
  template: RuntimeFieldCompositionTemplateDto,
): RuntimeFieldCompositionItemDto[] {
  return [...(template.items ?? [])].sort((left, right) => (left.itemOrder ?? 0) - (right.itemOrder ?? 0));
}

function sourceTypeOf(item: RuntimeFieldCompositionItemDto): string {
  return String(item.sourceType).trim().toLowerCase();
}

export function isAiCompositionItem(item: RuntimeFieldCompositionItemDto): boolean {
  return sourceTypeOf(item) === 'ai';
}

export function isFixedCompositionItem(item: RuntimeFieldCompositionItemDto): boolean {
  return sourceTypeOf(item) === 'fixed';
}

export function createDefaultCompositionValues(
  template: RuntimeFieldCompositionTemplateDto,
): Record<string, string> {
  return sortedCompositionItems(template).reduce<Record<string, string>>((result, item) => {
    result[item.itemKey] = isFixedCompositionItem(item) ? item.defaultText || '' : '';
    return result;
  }, {});
}

function replaceLineTokens(template: string, index: number, label: string, value: string): string {
  return template
    .replace(/\{\{index\}\}/g, String(index + 1))
    .replace(/\{\{label\}\}/g, label)
    .replace(/\{\{value\}\}/g, value);
}

function extractLineValue(
  item: RuntimeFieldCompositionItemDto,
  index: number,
  line: string,
): string | undefined {
  const marker = `__MEDAI_COMPOSITION_VALUE_${index}__`;
  const rendered = replaceLineTokens(
    item.lineTemplate || DEFAULT_COMPOSITION_LINE_TEMPLATE,
    index,
    item.itemLabel || '',
    marker,
  );
  const markerIndex = rendered.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const prefix = rendered.slice(0, markerIndex);
  const suffix = rendered.slice(markerIndex + marker.length);
  if (!line.startsWith(prefix) || !line.endsWith(suffix)) return undefined;
  if (line.length < prefix.length + suffix.length) return undefined;

  const end = suffix ? line.length - suffix.length : line.length;
  return line.slice(prefix.length, end).trim();
}

export function parseCompositionFieldValue(
  template: RuntimeFieldCompositionTemplateDto,
  value?: string,
): CompositionParseResult {
  const values = createDefaultCompositionValues(template);
  const text = String(value ?? '');
  if (!text.trim()) {
    return { values, complete: true, warnings: [] };
  }

  const items = sortedCompositionItems(template);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const warnings: string[] = [];

  items.forEach((item, index) => {
    const line = lines[index];
    const parsedValue = line === undefined ? undefined : extractLineValue(item, index, line);
    if (parsedValue === undefined) {
      warnings.push(`第${index + 1}行未匹配“${item.itemLabel}”的当前组合模板，已保留该子项原值。`);
      return;
    }
    if (!isFixedCompositionItem(item)) {
      values[item.itemKey] = parsedValue;
    }
  });

  if (lines.length !== items.length) {
    warnings.push(`组合字段应为${items.length}行，当前识别到${lines.length}行，未匹配内容未自动兼容。`);
  }

  return {
    values,
    complete: warnings.length === 0,
    warnings,
  };
}

function normalizeCompositionItemOutput(value: string | undefined): string {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('；');
}

export function formatCompositionFieldValue(
  template: RuntimeFieldCompositionTemplateDto,
  values: Record<string, string>,
): string {
  return sortedCompositionItems(template)
    .map((item, index) => replaceLineTokens(
      item.lineTemplate || DEFAULT_COMPOSITION_LINE_TEMPLATE,
      index,
      item.itemLabel || '',
      normalizeCompositionItemOutput(values[item.itemKey]),
    ))
    .join('\n');
}

export function mergeRuntimeCompositionValues(
  template: RuntimeFieldCompositionTemplateDto,
  currentValues: Record<string, string> | undefined,
  runtimeValue: string,
): CompositionParseResult {
  const parsed = parseCompositionFieldValue(template, runtimeValue);
  const defaults = createDefaultCompositionValues(template);
  const current = { ...defaults, ...(currentValues ?? {}) };
  const values = { ...defaults };

  sortedCompositionItems(template).forEach((item) => {
    if (isFixedCompositionItem(item)) {
      values[item.itemKey] = item.defaultText || '';
      return;
    }
    if (sourceTypeOf(item) === 'manual') {
      values[item.itemKey] = current[item.itemKey] || '';
      return;
    }
    if (isAiCompositionItem(item)) {
      values[item.itemKey] = parsed.values[item.itemKey]?.trim()
        ? parsed.values[item.itemKey]
        : current[item.itemKey] || '';
      return;
    }
    values[item.itemKey] = current[item.itemKey] || '';
  });

  return { ...parsed, values };
}

export function retainCompositionValuesByItemKey(
  template: RuntimeFieldCompositionTemplateDto,
  currentValues: Record<string, string> | undefined,
): Record<string, string> {
  const values = createDefaultCompositionValues(template);
  sortedCompositionItems(template).forEach((item) => {
    if (isFixedCompositionItem(item)) return;
    if (Object.prototype.hasOwnProperty.call(currentValues ?? {}, item.itemKey)) {
      values[item.itemKey] = currentValues?.[item.itemKey] ?? '';
    }
  });
  return values;
}

export function getCompositionSourceLabel(item: RuntimeFieldCompositionItemDto): string {
  switch (sourceTypeOf(item)) {
    case 'ai':
      return '助手生成';
    case 'fixed':
      return '模板固定';
    case 'manual':
      return '手工填写';
    default:
      return item.sourceType || '未知来源';
  }
}
