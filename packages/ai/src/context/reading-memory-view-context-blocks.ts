import type {
  ContextSourceLabel,
  ReadingMemoryEntry,
  ReadingMemoryView,
  SourceLabeledContextBlock,
  TraceItem,
} from '@yomitomo/shared';
import { parseReadingMemoryEntryPayload } from '@yomitomo/core';

export function readingMemoryViewContextBlocks(
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
  const parsed = parseReadingMemoryEntryPayload(entry);
  if (!parsed) return '';

  if (parsed.type === 'summary') {
    const terms =
      parsed.payload.keyTerms.length > 0 ? `\nkeywords: ${parsed.payload.keyTerms.join(', ')}` : '';
    return `summary (${entry.scope}): ${parsed.payload.summary}${terms}`;
  }

  if (parsed.type === 'trace') {
    return parsed.payload.items.map(formatTraceItem).join('\n');
  }

  if (parsed.type === 'correction') {
    const replacement =
      parsed.payload.replacement === undefined
        ? ''
        : `\nreplacement: ${stringifyValue(parsed.payload.replacement)}`;
    return `correction: ${parsed.payload.reason}${replacement}`;
  }

  const authorPrefix = parsed.payload.author ? `${parsed.payload.author} ` : '';
  if (parsed.type === 'comment') {
    return `${authorPrefix}comment: ${parsed.payload.content}`;
  }

  if (parsed.type === 'annotation') {
    const parts = [
      parsed.payload.anchorExact ? `selection: ${parsed.payload.anchorExact}` : '',
      parsed.payload.annotationType ? `type: ${parsed.payload.annotationType}` : '',
      parsed.payload.readingIntent ? `intent: ${parsed.payload.readingIntent}` : '',
      parsed.payload.whyHere ? `why: ${parsed.payload.whyHere}` : '',
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

function stringifyValue(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
