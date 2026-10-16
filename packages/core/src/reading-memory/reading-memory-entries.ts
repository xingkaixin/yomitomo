import type {
  Annotation,
  Comment,
  ReadingMemoryEntry,
  ReadingMemoryEntryKind,
  ReadingMemoryScope,
  ReadingMemorySourceType,
  ReadingMemoryVisibility,
  TextAnchor,
  TextRange,
} from '@yomitomo/shared';
import { uniqueTrimmedStrings } from '@yomitomo/shared';

const ENTRY_KINDS = new Set<ReadingMemoryEntryKind>([
  'summary',
  'trace',
  'anchor',
  // Reserved compatibility kind. There is no production writer for new correction entries.
  'correction',
  'reader_signal',
  'progress',
  // Reserved compatibility kinds; kept so existing rows can still be normalized.
  'preference',
  'retrieval_note',
]);

const ENTRY_SCOPES = new Set<ReadingMemoryScope>(['segment', 'chapter', 'book', 'reader', 'agent']);

const ENTRY_VISIBILITIES = new Set<ReadingMemoryVisibility>([
  'default',
  // Non-default visibilities are reserved compatibility values, not enabled writer paths.
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
  // Reserved compatibility source type. There is no production writer for new correction entries.
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
    sourceEntryIds: uniqueTrimmedStrings(entry.sourceEntryIds || []),
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
    kind: annotation.author.kind === 'user' ? 'reader_signal' : 'trace',
    scope: annotation.author.kind === 'user' ? 'reader' : 'agent',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: annotation.anchor.chapterId,
    segmentId: annotation.anchor.segmentId,
    paragraphId: annotation.anchor.paragraphId,
    textRange: input.textRange || anchorTextRange(annotation.anchor),
    agentId: annotation.author.kind === 'agent' ? annotation.author.agentId : undefined,
    readerId: annotation.author.kind === 'user' ? annotation.author.userId : undefined,
    sourceType: 'annotation',
    sourceId: annotation.id,
    sourceAnnotationId: annotation.id,
    sourceEntryIds: [],
    anchor: annotation.anchor,
    payload: {
      source: 'annotation',
      author: annotation.author.kind === 'agent' ? 'ai' : 'user',
      annotationType: annotation.annotationType,
      readingIntent: annotation.readingIntent,
      moveType: annotation.moveType,
      whyHere: annotation.whyHere,
      evidenceUsed: annotation.evidenceUsed,
      confidence: annotation.confidence,
      anchorExact: annotation.anchor.exact,
      agentUsername: annotation.author.kind === 'agent' ? annotation.author.username : undefined,
      userUsername: annotation.author.kind === 'user' ? annotation.author.username : undefined,
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
    kind: input.comment.author.kind === 'user' ? 'reader_signal' : 'trace',
    scope: input.comment.author.kind === 'user' ? 'reader' : 'agent',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: input.annotation.anchor.chapterId,
    segmentId: input.annotation.anchor.segmentId,
    paragraphId: input.annotation.anchor.paragraphId,
    textRange: input.textRange || anchorTextRange(input.annotation.anchor),
    agentId: input.comment.author.kind === 'agent' ? input.comment.author.agentId : undefined,
    readerId: input.comment.author.kind === 'user' ? input.comment.author.userId : undefined,
    sourceType: 'comment',
    sourceId: input.comment.id,
    sourceAnnotationId: input.annotation.id,
    sourceCommentId: input.comment.id,
    sourceEntryIds: [annotationMemoryEntryId(input.annotation.id)],
    anchor: input.annotation.anchor,
    payload: {
      source: 'comment',
      author: input.comment.author.kind === 'agent' ? 'ai' : 'user',
      content,
      replyTo: input.comment.replyTo,
      readingIntent: input.comment.readingIntent,
      reviewLabel: input.comment.reviewLabel,
      annotationId: input.annotation.id,
      anchorExact: input.annotation.anchor.exact,
      agentUsername:
        input.comment.author.kind === 'agent' ? input.comment.author.username : undefined,
      userUsername:
        input.comment.author.kind === 'user' ? input.comment.author.username : undefined,
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

function normalizeTextRange(range: TextRange | undefined) {
  if (!range) return undefined;
  if (!Number.isInteger(range.textStart) || !Number.isInteger(range.textEnd)) return null;
  if (range.textEnd <= range.textStart) return null;
  return range;
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
