import type {
  ContextSourceLabel,
  ReadingMemoryEntry,
  ReadingMemoryCorrectionPayload,
  ReadingMemorySummaryPayload,
  ReadingMemoryTracePayload,
  ReadingMemoryView,
  SourceLabeledContextBlock,
  TraceItem,
} from '@yomitomo/shared';

export function memoryViewContextBlocks(
  view: ReadingMemoryView | undefined,
): SourceLabeledContextBlock[] {
  if (!view) return [];

  return view.entries.flatMap((item, index) => {
    const text = memoryEntryBlockText(item.entry);
    if (!text) return [];
    return [
      {
        id: `${view.viewKey}:memory:${item.entry.id}`,
        text,
        source: {
          type: 'memory_view',
          articleId: view.articleId,
          chapterId: item.entry.chapterId,
          segmentId: item.entry.segmentId,
          paragraphId: item.entry.paragraphId,
          score: item.score ?? memoryEntryScore(item.entry, item.source, index),
          source: `reading-memory-${item.source}`,
        } satisfies ContextSourceLabel,
      },
    ];
  });
}

function memoryEntryBlockText(entry: ReadingMemoryEntry) {
  if (entry.kind === 'summary' && isSummaryPayload(entry.payload)) {
    const terms =
      entry.payload.keyTerms.length > 0 ? `\nkeywords: ${entry.payload.keyTerms.join(', ')}` : '';
    return `summary (${entry.scope}): ${entry.payload.summary}${terms}`;
  }

  if (entry.kind === 'trace' && isTracePayload(entry.payload)) {
    return entry.payload.items.map(formatTraceItem).join('\n');
  }

  if (entry.kind === 'correction' && isCorrectionPayload(entry.payload)) {
    const replacement =
      entry.payload.replacement === undefined
        ? ''
        : `\nreplacement: ${stringifyValue(entry.payload.replacement)}`;
    return `correction: ${entry.payload.reason}${replacement}`;
  }

  const sourcePayload = memorySourcePayloadText(entry);
  if (sourcePayload) return sourcePayload;

  return '';
}

function memorySourcePayloadText(entry: ReadingMemoryEntry) {
  if (!isRecord(entry.payload)) return '';
  const payload = entry.payload as Record<string, unknown>;
  const source = stringField(payload.source);
  const author = stringField(payload.author);
  const authorPrefix = author ? `${author} ` : '';

  if (source === 'comment') {
    const content = stringField(payload.content);
    if (!content) return '';
    return `${authorPrefix}comment: ${content}`;
  }

  if (source === 'annotation') {
    const anchorExact = stringField(payload.anchorExact);
    const annotationType = stringField(payload.annotationType);
    const readingIntent = stringField(payload.readingIntent);
    const whyHere = stringField(payload.whyHere);
    const parts = [
      anchorExact ? `selection: ${anchorExact}` : '',
      annotationType ? `type: ${annotationType}` : '',
      readingIntent ? `intent: ${readingIntent}` : '',
      whyHere ? `why: ${whyHere}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `${authorPrefix}annotation\n${parts.join('\n')}` : '';
  }

  return '';
}

function memoryEntryScore(
  entry: ReadingMemoryEntry,
  source: ReadingMemoryView['entries'][number]['source'],
  index: number,
) {
  const sourceScore = source === 'structured' ? 1 : 0.7;
  const recencyPenalty = Math.min(index * 0.01, 0.2);
  return Math.max(0, sourceScore - recencyPenalty + (entry.kind === 'correction' ? 0.1 : 0));
}

function formatTraceItem(item: TraceItem) {
  return `${item.type} / ${item.confidence}: ${item.content}`;
}

function isSummaryPayload(
  payload: ReadingMemoryEntry['payload'],
): payload is ReadingMemorySummaryPayload {
  if (!isRecord(payload)) return false;
  const value = payload as Record<string, unknown>;
  const keyTerms = value.keyTerms;
  return (
    typeof value.summary === 'string' &&
    Array.isArray(keyTerms) &&
    keyTerms.every((term) => typeof term === 'string')
  );
}

function isTracePayload(
  payload: ReadingMemoryEntry['payload'],
): payload is ReadingMemoryTracePayload {
  if (!isRecord(payload)) return false;
  return Array.isArray((payload as Record<string, unknown>).items);
}

function isCorrectionPayload(
  payload: ReadingMemoryEntry['payload'],
): payload is ReadingMemoryCorrectionPayload {
  if (!isRecord(payload)) return false;
  return typeof (payload as Record<string, unknown>).reason === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
