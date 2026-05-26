import type {
  Annotation,
  Comment,
  EpubBookIndex,
  ReadingMemory,
  ReadingMemoryEntry,
  ReadingMemoryEntryKind,
  ReadingMemoryScope,
  ReadingMemorySourceType,
  ReadingMemoryVisibility,
  ReadingTrace,
  TextAnchor,
  TextSummary,
  TextRange,
} from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import { createEpubTextAnchor } from './ebook-index';

const ENTRY_KINDS = new Set<ReadingMemoryEntryKind>([
  'summary',
  'trace',
  'anchor',
  'correction',
  'reader_signal',
  'progress',
  'preference',
  'retrieval_note',
]);

const ENTRY_SCOPES = new Set<ReadingMemoryScope>(['segment', 'chapter', 'book', 'reader', 'agent']);

const ENTRY_VISIBILITIES = new Set<ReadingMemoryVisibility>([
  'default',
  'hidden',
  'agent_private',
  'debug_only',
]);

const SOURCE_TYPES = new Set<ReadingMemorySourceType>([
  'original_text',
  'ai_task',
  'annotation',
  'comment',
  'progress',
  'correction',
  'import',
]);

export function normalizeReadingMemoryEntry(entry: ReadingMemoryEntry): ReadingMemoryEntry | null {
  if (!entry.id || !entry.articleId || !entry.createdAt || !entry.updatedAt) return null;
  if (!ENTRY_KINDS.has(entry.kind)) return null;
  if (!ENTRY_SCOPES.has(entry.scope)) return null;
  if (!ENTRY_VISIBILITIES.has(entry.visibility)) return null;
  if (!SOURCE_TYPES.has(entry.sourceType)) return null;
  if (!Number.isInteger(entry.payloadVersion) || entry.payloadVersion < 1) return null;

  const textRange = normalizeTextRange(entry.textRange);
  if (entry.textRange && !textRange) return null;

  return {
    ...entry,
    textRange: textRange || undefined,
    sourceEntryIds: uniqueStrings(entry.sourceEntryIds || []),
  };
}

export function activeReadingMemoryEntries(entries: ReadingMemoryEntry[]) {
  return applySupersededEntryFilter(entries.filter((entry) => !entry.deletedAt));
}

export function applySupersededEntryFilter(entries: ReadingMemoryEntry[]) {
  const supersededIds = new Set(
    entries.map((entry) => entry.supersedesEntryId).filter((id): id is string => Boolean(id)),
  );
  if (supersededIds.size === 0) return entries;
  return entries.filter((entry) => !supersededIds.has(entry.id));
}

export function readingMemoryEntrySearchText(entry: ReadingMemoryEntry) {
  const parts = collectSearchTextParts(entry.payload);
  if (entry.anchor?.exact) parts.push(entry.anchor.exact);
  return compactSearchText(parts.join(' '));
}

export function readingMemoryEntriesFromMemoryDelta(input: {
  articleId: string;
  agentId?: string;
  sourceTaskId: string;
  createdAt: string;
  current?: ReadingMemory;
  next?: ReadingMemory;
}): ReadingMemoryEntry[] {
  const next = input.next;
  if (!next) return [];
  const entries: ReadingMemoryEntry[] = [];
  const currentSummaries = new Map(
    (input.current?.textSummaries || []).map((summary) => [textSummaryKey(summary), summary]),
  );
  const currentTraces = new Map(
    (input.current?.readingTraces || []).map((trace) => [readingTraceKey(trace), trace]),
  );

  for (const summary of next.textSummaries || []) {
    const previous = currentSummaries.get(textSummaryKey(summary));
    if (previous && JSON.stringify(previous) === JSON.stringify(summary)) continue;
    entries.push(summaryEntry(input, summary, entries.length));
  }

  for (const trace of next.readingTraces || []) {
    const previous = currentTraces.get(readingTraceKey(trace));
    if (previous && JSON.stringify(previous) === JSON.stringify(trace)) continue;
    entries.push(traceEntry(input, trace, entries.length));
  }

  return entries;
}

export function readingMemoryEntryFromAnnotation(input: {
  articleId: string;
  annotation: Annotation;
  createdAt?: string;
  textRange?: TextRange;
}): ReadingMemoryEntry | null {
  const annotation = input.annotation;
  if (!annotation.id || !annotation.anchor.exact.trim()) return null;
  const createdAt = input.createdAt || annotation.createdAt;
  return {
    id: annotationMemoryEntryId(annotation.id),
    articleId: input.articleId,
    kind: annotation.author === 'user' ? 'reader_signal' : 'trace',
    scope: annotation.author === 'user' ? 'reader' : 'agent',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: annotation.anchor.chapterId,
    segmentId: annotation.anchor.segmentId,
    paragraphId: annotation.anchor.paragraphId,
    textRange: input.textRange || anchorTextRange(annotation.anchor),
    agentId: annotation.agentId,
    readerId: annotation.userId,
    sourceType: 'annotation',
    sourceId: annotation.id,
    sourceAnnotationId: annotation.id,
    sourceEntryIds: [],
    anchor: annotation.anchor,
    payload: {
      source: 'annotation',
      author: annotation.author,
      annotationType: annotation.annotationType,
      readingIntent: annotation.readingIntent,
      moveType: annotation.moveType,
      whyHere: annotation.whyHere,
      evidenceUsed: annotation.evidenceUsed,
      confidence: annotation.confidence,
      anchorExact: annotation.anchor.exact,
      agentUsername: annotation.agentUsername,
      userUsername: annotation.userUsername,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
    },
    createdAt,
    updatedAt: annotation.updatedAt || createdAt,
  };
}

export function readingMemoryEntryFromComment(input: {
  articleId: string;
  annotation: Annotation;
  comment: Comment;
  createdAt?: string;
  textRange?: TextRange;
}): ReadingMemoryEntry | null {
  const content = input.comment.content.trim();
  if (!input.comment.id || !content) return null;
  const createdAt = input.createdAt || input.comment.createdAt;
  return {
    id: commentMemoryEntryId(input.comment.id),
    articleId: input.articleId,
    kind: input.comment.author === 'user' ? 'reader_signal' : 'trace',
    scope: input.comment.author === 'user' ? 'reader' : 'agent',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: input.annotation.anchor.chapterId,
    segmentId: input.annotation.anchor.segmentId,
    paragraphId: input.annotation.anchor.paragraphId,
    textRange: input.textRange || anchorTextRange(input.annotation.anchor),
    agentId: input.comment.agentId,
    readerId: input.comment.userId,
    sourceType: 'comment',
    sourceId: input.comment.id,
    sourceAnnotationId: input.annotation.id,
    sourceCommentId: input.comment.id,
    sourceEntryIds: [annotationMemoryEntryId(input.annotation.id)],
    anchor: input.annotation.anchor,
    payload: {
      source: 'comment',
      author: input.comment.author,
      content,
      replyTo: input.comment.replyTo,
      readingIntent: input.comment.readingIntent,
      reviewLabel: input.comment.reviewLabel,
      annotationId: input.annotation.id,
      anchorExact: input.annotation.anchor.exact,
      agentUsername: input.comment.agentUsername,
      userUsername: input.comment.userUsername,
      createdAt: input.comment.createdAt,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export function readingMemoryEntriesFromAnnotationThread(input: {
  articleId: string;
  annotation: Annotation;
  createdAt?: string;
  textRange?: TextRange;
}): ReadingMemoryEntry[] {
  const annotationEntry = readingMemoryEntryFromAnnotation(input);
  const commentEntries = input.annotation.comments.flatMap((comment) => {
    const entry = readingMemoryEntryFromComment({
      ...input,
      comment,
    });
    return entry ? [entry] : [];
  });
  return annotationEntry ? [annotationEntry, ...commentEntries] : commentEntries;
}

export function readingMemoryAnchorCheckpointEntries(input: {
  articleText: string;
  ebookIndex?: EpubBookIndex;
  sourceTaskId: string;
  createdAt: string;
  entries: ReadingMemoryEntry[];
}): ReadingMemoryEntry[] {
  const checkpoints: ReadingMemoryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of input.entries) {
    if (!entry.textRange) continue;
    const anchor = anchorForEntry(input.articleText, input.ebookIndex, entry.textRange);
    if (!anchor) continue;
    const key = [
      entry.articleId,
      entry.scope,
      entry.chapterId || '',
      entry.segmentId || '',
      anchor.start,
      anchor.end,
      anchor.quoteHash || anchor.exact,
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    checkpoints.push({
      id: `${input.sourceTaskId}_anchor_${checkpoints.length}`,
      articleId: entry.articleId,
      kind: 'anchor',
      scope: entry.scope,
      visibility: 'default',
      payloadVersion: 1,
      chapterId: entry.chapterId || anchor.chapterId,
      segmentId: entry.segmentId || anchor.segmentId,
      paragraphId: entry.paragraphId || anchor.paragraphId,
      textRange: entry.textRange,
      agentId: entry.agentId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceAnnotationId: entry.sourceAnnotationId,
      sourceCommentId: entry.sourceCommentId,
      sourceTaskId: entry.sourceTaskId,
      sourceEntryIds: [entry.id],
      anchor,
      payload: {
        anchor,
        label: `${entry.kind}:${entry.scope}`,
      },
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  }

  return checkpoints;
}

export function readingMemoryCorrectionEntry(input: {
  id: string;
  articleId: string;
  targetEntry: ReadingMemoryEntry;
  reason: string;
  replacement?: unknown;
  createdAt: string;
  readerId?: string;
  anchor?: TextAnchor;
}): ReadingMemoryEntry | null {
  const reason = input.reason.trim();
  if (!reason) return null;
  return {
    id: input.id,
    articleId: input.articleId,
    kind: 'correction',
    scope: input.targetEntry.scope,
    visibility: 'default',
    payloadVersion: 1,
    chapterId: input.targetEntry.chapterId,
    segmentId: input.targetEntry.segmentId,
    paragraphId: input.targetEntry.paragraphId,
    textRange: input.targetEntry.textRange,
    readerId: input.readerId,
    sourceType: 'correction',
    sourceId: input.id,
    sourceEntryIds: [input.targetEntry.id],
    supersedesEntryId: input.targetEntry.id,
    anchor: input.anchor || input.targetEntry.anchor,
    payload: {
      reason,
      replacement: input.replacement,
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function readingMemoryFromEntries(entries: ReadingMemoryEntry[]): ReadingMemory | undefined {
  const activeEntries = activeReadingMemoryEntries(entries);
  if (activeEntries.length === 0) return undefined;

  const projectedEntries: ReadingMemoryEntry[] = [];
  const textSummaries = activeEntries.flatMap((entry) => {
    const summary = textSummaryFromEntry(entry);
    if (summary) projectedEntries.push(entry);
    return summary ? [summary] : [];
  });
  const readingTraces = activeEntries.flatMap((entry) => {
    const trace = readingTraceFromEntry(entry) || correctionTraceFromEntry(entry);
    if (trace) projectedEntries.push(entry);
    return trace ? [trace] : [];
  });
  if (textSummaries.length === 0 && readingTraces.length === 0) return undefined;

  return {
    textSummaries,
    readingTraces,
    updatedAt: latestUpdatedAt(projectedEntries),
  };
}

function normalizeTextRange(range: TextRange | undefined) {
  if (!range) return undefined;
  if (!Number.isInteger(range.textStart) || !Number.isInteger(range.textEnd)) return null;
  if (range.textEnd <= range.textStart) return null;
  return range;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function collectSearchTextParts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(collectSearchTextParts);

  const parts: string[] = [];
  for (const item of Object.values(value)) {
    parts.push(...collectSearchTextParts(item));
  }
  return parts;
}

function compactSearchText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function anchorForEntry(
  articleText: string,
  ebookIndex: EpubBookIndex | undefined,
  range: TextRange,
): TextAnchor | null {
  if (range.textStart < 0 || range.textEnd > articleText.length) return null;
  if (range.textEnd <= range.textStart) return null;
  const anchor = ebookIndex
    ? createEpubTextAnchor(ebookIndex, articleText, range.textStart, range.textEnd)
    : createTextAnchor(articleText, range.textStart, range.textEnd);
  return anchor.exact.trim() ? anchor : null;
}

function anchorTextRange(anchor: TextAnchor): TextRange | undefined {
  const textStart = anchor.textStartInBook ?? anchor.start;
  const textEnd = anchor.textEndInBook ?? anchor.end;
  if (!Number.isInteger(textStart) || !Number.isInteger(textEnd)) return undefined;
  if (textEnd <= textStart) return undefined;
  return { textStart, textEnd };
}

function annotationMemoryEntryId(annotationId: string) {
  return `annotation_memory_${annotationId}`;
}

function commentMemoryEntryId(commentId: string) {
  return `comment_memory_${commentId}`;
}

function textSummaryFromEntry(entry: ReadingMemoryEntry): TextSummary | null {
  if (entry.kind !== 'summary') return null;
  if (!entry.textRange) return null;
  if (entry.scope !== 'segment' && entry.scope !== 'chapter' && entry.scope !== 'book') {
    return null;
  }
  if (!isSummaryPayload(entry.payload)) return null;
  return {
    scope: entry.scope,
    chapterId: entry.chapterId,
    segmentId: entry.segmentId,
    sourceRange: entry.textRange,
    summary: entry.payload.summary,
    keyTerms: entry.payload.keyTerms,
    updatedAt: entry.updatedAt,
  };
}

function readingTraceFromEntry(entry: ReadingMemoryEntry): ReadingTrace | null {
  if (entry.kind !== 'trace') return null;
  if (
    entry.scope !== 'segment' &&
    entry.scope !== 'chapter' &&
    entry.scope !== 'agent' &&
    entry.scope !== 'reader'
  ) {
    return null;
  }
  if (!isTracePayload(entry.payload)) return null;
  return {
    scope: entry.scope,
    chapterId: entry.chapterId,
    segmentId: entry.segmentId,
    sourceRange: entry.textRange,
    agentId: entry.agentId,
    items: entry.payload.items,
    updatedAt: entry.updatedAt,
  };
}

function correctionTraceFromEntry(entry: ReadingMemoryEntry): ReadingTrace | null {
  if (entry.kind !== 'correction') return null;
  if (
    entry.scope !== 'segment' &&
    entry.scope !== 'chapter' &&
    entry.scope !== 'agent' &&
    entry.scope !== 'reader'
  ) {
    return null;
  }
  if (!isCorrectionPayload(entry.payload)) return null;
  const replacementText =
    entry.payload.replacement === undefined
      ? ''
      : `；replacement：${stringifyCorrectionReplacement(entry.payload.replacement)}`;
  return {
    scope: entry.scope,
    chapterId: entry.chapterId,
    segmentId: entry.segmentId,
    sourceRange: entry.textRange,
    agentId: entry.agentId,
    items: [
      {
        type: 'reader_interest',
        content: `correction：${entry.payload.reason}${replacementText}`,
        evidenceAnchors: entry.anchor ? [entry.anchor] : [],
        confidence: 'high',
        createdFromTask: 'memory_correction',
      },
    ],
    updatedAt: entry.updatedAt,
  };
}

function isSummaryPayload(payload: ReadingMemoryEntry['payload']): payload is {
  summary: string;
  keyTerms: string[];
} {
  if (!isRecord(payload)) return false;
  const value = payload as Record<string, unknown>;
  const keyTerms = value.keyTerms;
  return (
    typeof value.summary === 'string' &&
    Array.isArray(keyTerms) &&
    keyTerms.every((term) => typeof term === 'string')
  );
}

function isTracePayload(payload: ReadingMemoryEntry['payload']): payload is {
  items: ReadingTrace['items'];
} {
  if (!isRecord(payload)) return false;
  return Array.isArray((payload as Record<string, unknown>).items);
}

function isCorrectionPayload(payload: ReadingMemoryEntry['payload']): payload is {
  reason: string;
  replacement?: unknown;
} {
  if (!isRecord(payload)) return false;
  return typeof (payload as Record<string, unknown>).reason === 'string';
}

function stringifyCorrectionReplacement(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function latestUpdatedAt(entries: ReadingMemoryEntry[]) {
  return entries.reduce((latest, entry) => {
    if (!latest || entry.updatedAt > latest) return entry.updatedAt;
    return latest;
  }, '');
}

function summaryEntry(
  input: {
    articleId: string;
    agentId?: string;
    sourceTaskId: string;
    createdAt: string;
  },
  summary: TextSummary,
  index: number,
): ReadingMemoryEntry {
  return {
    id: `${input.sourceTaskId}_summary_${index}`,
    articleId: input.articleId,
    kind: 'summary',
    scope: summary.scope,
    visibility: 'default',
    payloadVersion: 1,
    chapterId: summary.chapterId,
    segmentId: summary.segmentId,
    textRange: summary.sourceRange,
    agentId: input.agentId,
    sourceType: 'ai_task',
    sourceId: input.sourceTaskId,
    sourceTaskId: input.sourceTaskId,
    sourceEntryIds: [],
    payload: {
      summary: summary.summary,
      keyTerms: summary.keyTerms,
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function traceEntry(
  input: {
    articleId: string;
    agentId?: string;
    sourceTaskId: string;
    createdAt: string;
  },
  trace: ReadingTrace,
  index: number,
): ReadingMemoryEntry {
  return {
    id: `${input.sourceTaskId}_trace_${index}`,
    articleId: input.articleId,
    kind: 'trace',
    scope: trace.scope,
    visibility: 'default',
    payloadVersion: 1,
    chapterId: trace.chapterId,
    segmentId: trace.segmentId,
    textRange: trace.sourceRange,
    agentId: trace.agentId || input.agentId,
    sourceType: 'ai_task',
    sourceId: input.sourceTaskId,
    sourceTaskId: input.sourceTaskId,
    sourceEntryIds: [],
    payload: {
      items: trace.items,
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
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
