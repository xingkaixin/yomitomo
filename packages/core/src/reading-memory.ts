import type { ReadingMemory, ReadingTrace, TextSummary, TraceItem } from '@yomitomo/shared';

const MAX_SUMMARY_CHARS = 700;
const MAX_KEY_TERMS = 12;
const MAX_TRACE_CONTENT_CHARS = 280;
const MAX_SEGMENT_TRACE_ITEMS = 6;
const MAX_CHAPTER_TRACE_ITEMS = 16;
const MAX_OTHER_TRACE_ITEMS = 10;

export function mergeReadingMemory(
  current: ReadingMemory | undefined,
  update: ReadingMemory | undefined,
): ReadingMemory | undefined {
  if (!current) return normalizeReadingMemory(update);
  if (!update) return normalizeReadingMemory(current);

  const textSummaries = mergeTextSummaries(current.textSummaries, update.textSummaries);
  const readingTraces = mergeReadingTraces(current.readingTraces, update.readingTraces);

  if (textSummaries.length === 0 && readingTraces.length === 0) return undefined;
  return {
    textSummaries,
    readingTraces,
    updatedAt: update.updatedAt || current.updatedAt,
  };
}

function normalizeReadingMemory(memory: ReadingMemory | undefined): ReadingMemory | undefined {
  if (!memory) return undefined;
  const textSummaries = mergeTextSummaries([], memory.textSummaries);
  const readingTraces = mergeReadingTraces([], memory.readingTraces);
  if (textSummaries.length === 0 && readingTraces.length === 0) return undefined;
  return {
    textSummaries,
    readingTraces,
    updatedAt: memory.updatedAt,
  };
}

function mergeTextSummaries(current: TextSummary[] = [], updates: TextSummary[] = []) {
  const byKey = new Map<string, TextSummary>();
  for (const summary of [...current, ...updates]) {
    const normalized = normalizeTextSummary(summary);
    if (!normalized) continue;
    byKey.set(textSummaryKey(normalized), normalized);
  }
  return Array.from(byKey.values()).toSorted(
    (left, right) => left.sourceRange.textStart - right.sourceRange.textStart,
  );
}

function normalizeTextSummary(summary: TextSummary): TextSummary | null {
  const sourceRange = normalizeSourceRange(summary.sourceRange);
  const text = compactText(summary.summary, MAX_SUMMARY_CHARS);
  if (!sourceRange || !text) return null;
  return {
    ...summary,
    sourceRange,
    summary: text,
    keyTerms: uniqueStrings(summary.keyTerms || [])
      .map((term) => compactText(term, 40))
      .filter(Boolean)
      .slice(0, MAX_KEY_TERMS),
    updatedAt: summary.updatedAt,
  };
}

function textSummaryKey(summary: TextSummary) {
  return [
    summary.scope,
    summary.chapterId || '',
    summary.segmentId || '',
    summary.sourceRange.textStart,
    summary.sourceRange.textEnd,
  ].join(':');
}

function mergeReadingTraces(current: ReadingTrace[] = [], updates: ReadingTrace[] = []) {
  const byKey = new Map<string, ReadingTrace>();
  for (const trace of [...current, ...updates]) {
    const normalized = normalizeReadingTrace(trace);
    if (!normalized) continue;
    const key = readingTraceKey(normalized);
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeTraceItems(previous, normalized) : normalized);
  }
  return Array.from(byKey.values()).toSorted((left, right) => {
    const leftStart = left.sourceRange?.textStart ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.sourceRange?.textStart ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  });
}

function normalizeReadingTrace(trace: ReadingTrace): ReadingTrace | null {
  const sourceRange = trace.sourceRange
    ? normalizeSourceRange(trace.sourceRange) || undefined
    : undefined;
  const items = normalizeTraceItems(trace.items || [], maxTraceItems(trace.scope));
  if (items.length === 0) return null;
  return {
    ...trace,
    sourceRange,
    items,
    updatedAt: trace.updatedAt,
  };
}

function mergeTraceItems(current: ReadingTrace, update: ReadingTrace): ReadingTrace {
  return {
    ...current,
    ...update,
    items: normalizeTraceItems(
      [...current.items, ...update.items],
      maxTraceItems(update.scope || current.scope),
    ),
    updatedAt: update.updatedAt || current.updatedAt,
  };
}

function normalizeTraceItems(items: TraceItem[], limit: number) {
  const byKey = new Map<string, TraceItem>();
  for (const item of items) {
    const content = compactText(item.content, MAX_TRACE_CONTENT_CHARS);
    if (!content) continue;
    byKey.set(traceItemKey(item.type, content), {
      ...item,
      content,
      evidenceAnchors: (item.evidenceAnchors || []).filter((anchor) => anchor.exact.trim()),
      confidence: item.confidence || 'medium',
      createdFromTask: item.createdFromTask || 'unknown',
    });
  }
  return Array.from(byKey.values()).slice(-limit);
}

function readingTraceKey(trace: ReadingTrace) {
  return [
    trace.scope,
    trace.chapterId || '',
    trace.segmentId || '',
    trace.agentId || '',
    trace.sourceRange?.textStart ?? '',
    trace.sourceRange?.textEnd ?? '',
  ].join(':');
}

function traceItemKey(type: string, content: string) {
  return `${type}:${content.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function maxTraceItems(scope: ReadingTrace['scope']) {
  if (scope === 'segment') return MAX_SEGMENT_TRACE_ITEMS;
  if (scope === 'chapter') return MAX_CHAPTER_TRACE_ITEMS;
  return MAX_OTHER_TRACE_ITEMS;
}

function normalizeSourceRange(range: TextSummary['sourceRange']) {
  const textStart = integerValue(range?.textStart);
  const textEnd = integerValue(range?.textEnd);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;
  return { textStart, textEnd };
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trimEnd() : normalized;
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
