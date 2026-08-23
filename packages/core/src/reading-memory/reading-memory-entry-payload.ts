import type {
  ReadingMemoryCorrectionPayload,
  ReadingMemoryEntry,
  ReadingMemorySummaryPayload,
  ReadingMemoryTracePayload,
  TextAnchor,
  TraceItem,
} from '@yomitomo/shared';
import { isRecord, normalizeTraceItemType, trimmedStringField } from '@yomitomo/shared';

const CURRENT_PAYLOAD_VERSION = 1;

type ReadingMemoryAnnotationPayload = {
  source: 'annotation';
  author?: string;
  anchorExact?: string;
  annotationType?: string;
  readingIntent?: string;
  whyHere?: string;
};

type ReadingMemoryCommentPayload = {
  source: 'comment';
  author?: string;
  content: string;
};

export type ParsedReadingMemoryEntryPayload =
  | { type: 'summary'; payload: ReadingMemorySummaryPayload }
  | { type: 'trace'; payload: ReadingMemoryTracePayload }
  | { type: 'correction'; payload: ReadingMemoryCorrectionPayload }
  | { type: 'annotation'; payload: ReadingMemoryAnnotationPayload }
  | { type: 'comment'; payload: ReadingMemoryCommentPayload };

export function parseReadingMemoryEntryPayload(
  entry: ReadingMemoryEntry,
): ParsedReadingMemoryEntryPayload | null {
  if (entry.payloadVersion !== CURRENT_PAYLOAD_VERSION) return null;

  if (entry.sourceType === 'annotation') return parseAnnotationPayload(entry);
  if (entry.sourceType === 'comment') return parseCommentPayload(entry);

  if (entry.kind === 'summary') {
    const payload = parseSummaryPayload(entry.payload);
    return payload ? { type: 'summary', payload } : null;
  }

  if (entry.kind === 'trace') {
    const payload = parseTracePayload(entry.payload);
    return payload ? { type: 'trace', payload } : null;
  }

  if (entry.kind === 'correction' && entry.sourceType === 'correction') {
    const payload = parseCorrectionPayload(entry.payload);
    return payload ? { type: 'correction', payload } : null;
  }

  return null;
}

function parseSummaryPayload(payload: ReadingMemoryEntry['payload']) {
  if (!isRecord(payload)) return null;
  const summary = payload.summary;
  const keyTerms = payload.keyTerms;
  if (typeof summary !== 'string') return null;
  if (!Array.isArray(keyTerms) || !keyTerms.every((term) => typeof term === 'string')) return null;
  return { summary, keyTerms } satisfies ReadingMemorySummaryPayload;
}

function parseTracePayload(payload: ReadingMemoryEntry['payload']) {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return null;
  const items: TraceItem[] = [];
  for (const value of payload.items) {
    const item = parseTraceItem(value);
    if (!item) return null;
    items.push(item);
  }
  return { items } satisfies ReadingMemoryTracePayload;
}

function parseCorrectionPayload(payload: ReadingMemoryEntry['payload']) {
  if (!isRecord(payload) || typeof payload.reason !== 'string') return null;
  return {
    reason: payload.reason,
    ...(payload.replacement === undefined ? {} : { replacement: payload.replacement }),
  } satisfies ReadingMemoryCorrectionPayload;
}

function parseAnnotationPayload(entry: ReadingMemoryEntry) {
  if (entry.kind !== 'trace' && entry.kind !== 'reader_signal') return null;
  if (!isRecord(entry.payload) || entry.payload.source !== 'annotation') return null;
  return {
    type: 'annotation' as const,
    payload: {
      source: 'annotation' as const,
      author: optionalTrimmedString(entry.payload.author),
      anchorExact: optionalTrimmedString(entry.payload.anchorExact),
      annotationType: optionalTrimmedString(entry.payload.annotationType),
      readingIntent: optionalTrimmedString(entry.payload.readingIntent),
      whyHere: optionalTrimmedString(entry.payload.whyHere),
    },
  };
}

function parseCommentPayload(entry: ReadingMemoryEntry) {
  if (entry.kind !== 'trace' && entry.kind !== 'reader_signal') return null;
  if (!isRecord(entry.payload) || entry.payload.source !== 'comment') return null;
  const content = trimmedStringField(entry.payload.content);
  if (!content) return null;
  return {
    type: 'comment' as const,
    payload: {
      source: 'comment' as const,
      author: optionalTrimmedString(entry.payload.author),
      content,
    },
  };
}

function parseTraceItem(value: unknown): TraceItem | null {
  if (!isRecord(value)) return null;
  const type = normalizeTraceItemType(value.type);
  const confidence = value.confidence;
  const agentId = value.agentId;
  if (!type || typeof value.content !== 'string' || typeof value.createdFromTask !== 'string') {
    return null;
  }
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') return null;
  if (!Array.isArray(value.evidenceAnchors) || !value.evidenceAnchors.every(isTextAnchor))
    return null;
  if (agentId !== undefined && typeof agentId !== 'string') return null;

  return {
    type,
    content: value.content,
    evidenceAnchors: value.evidenceAnchors,
    agentId,
    confidence,
    createdFromTask: value.createdFromTask,
  };
}

function isTextAnchor(value: unknown): value is TextAnchor {
  if (!isRecord(value)) return false;
  if (
    typeof value.exact !== 'string' ||
    typeof value.prefix !== 'string' ||
    typeof value.suffix !== 'string' ||
    typeof value.start !== 'number' ||
    typeof value.end !== 'number'
  ) {
    return false;
  }

  return (
    optionalFieldIs(value.paragraphId, 'string') &&
    optionalFieldIs(value.chapterId, 'string') &&
    optionalFieldIs(value.segmentId, 'string') &&
    optionalFieldIs(value.textStartInParagraph, 'number') &&
    optionalFieldIs(value.textEndInParagraph, 'number') &&
    optionalFieldIs(value.textStartInBook, 'number') &&
    optionalFieldIs(value.textEndInBook, 'number') &&
    optionalFieldIs(value.quoteHash, 'string')
  );
}

function optionalFieldIs(value: unknown, expectedType: 'number' | 'string') {
  return value === undefined || typeof value === expectedType;
}

function optionalTrimmedString(value: unknown) {
  return trimmedStringField(value) || undefined;
}
