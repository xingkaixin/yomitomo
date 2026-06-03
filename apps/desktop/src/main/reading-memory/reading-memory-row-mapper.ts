import type {
  ReadingMemoryEntry,
  ReadingMemoryEntryKind,
  ReadingMemoryScope,
  ReadingMemorySourceType,
  ReadingMemoryVisibility,
  TextAnchor,
} from '@yomitomo/shared';
import { normalizeReadingMemoryEntry } from '@yomitomo/core';

export type SqliteValue = string | number | null;

export function readingMemoryEntrySqlValues(entry: ReadingMemoryEntry): SqliteValue[] {
  return [
    entry.id,
    entry.articleId,
    entry.kind,
    entry.scope,
    entry.visibility,
    entry.payloadVersion,
    entry.chapterId || null,
    entry.segmentId || null,
    entry.paragraphId || null,
    entry.textRange?.textStart ?? null,
    entry.textRange?.textEnd ?? null,
    entry.agentId || null,
    entry.readerId || null,
    entry.sourceType,
    entry.sourceId || null,
    entry.sourceAnnotationId || null,
    entry.sourceCommentId || null,
    entry.sourceTaskId || null,
    JSON.stringify(entry.sourceEntryIds),
    entry.supersedesEntryId || null,
    entry.anchor ? JSON.stringify(entry.anchor) : null,
    JSON.stringify(entry.payload),
    entry.createdAt,
    entry.updatedAt,
    entry.deletedAt || null,
    entry.deletionReason || null,
  ];
}

export function rowToReadingMemoryEntry(row: unknown): ReadingMemoryEntry | null {
  if (!isRecord(row)) return null;
  const value = row;
  const textStart = integerValue(value.text_start);
  const textEnd = integerValue(value.text_end);
  return normalizeReadingMemoryEntry({
    id: stringValue(value.id),
    articleId: stringValue(value.article_id),
    kind: normalizeMemoryKind(value.kind),
    scope: normalizeMemoryScope(value.scope),
    visibility: normalizeMemoryVisibility(value.visibility),
    payloadVersion: numberValue(value.payload_version),
    chapterId: optionalString(value.chapter_id),
    segmentId: optionalString(value.segment_id),
    paragraphId: optionalString(value.paragraph_id),
    textRange: textStart !== null && textEnd !== null ? { textStart, textEnd } : undefined,
    agentId: optionalString(value.agent_id),
    readerId: optionalString(value.reader_id),
    sourceType: normalizeMemorySourceType(value.source_type),
    sourceId: optionalString(value.source_id),
    sourceAnnotationId: optionalString(value.source_annotation_id),
    sourceCommentId: optionalString(value.source_comment_id),
    sourceTaskId: optionalString(value.source_task_id),
    sourceEntryIds: jsonStringArray(value.source_entry_ids),
    supersedesEntryId: optionalString(value.supersedes_entry_id),
    anchor: jsonTextAnchor(value.anchor),
    payload: jsonRecord(value.payload),
    createdAt: stringValue(value.created_at),
    updatedAt: stringValue(value.updated_at),
    deletedAt: optionalString(value.deleted_at),
    deletionReason: optionalString(value.deletion_reason),
  });
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}

function integerValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = numberValue(value);
  return Number.isInteger(number) ? number : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function jsonStringArray(value: unknown) {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return isRecord(parsed) ? parsed : {};
}

function jsonTextAnchor(value: unknown): TextAnchor | undefined {
  const parsed = parseJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.exact !== 'string' ||
    typeof parsed.prefix !== 'string' ||
    typeof parsed.suffix !== 'string' ||
    typeof parsed.start !== 'number' ||
    typeof parsed.end !== 'number'
  ) {
    return undefined;
  }
  return {
    exact: parsed.exact,
    prefix: parsed.prefix,
    suffix: parsed.suffix,
    start: parsed.start,
    end: parsed.end,
    paragraphId: optionalString(parsed.paragraphId),
    chapterId: optionalString(parsed.chapterId),
    segmentId: optionalString(parsed.segmentId),
    textStartInParagraph: optionalNumber(parsed.textStartInParagraph),
    textEndInParagraph: optionalNumber(parsed.textEndInParagraph),
    textStartInBook: optionalNumber(parsed.textStartInBook),
    textEndInBook: optionalNumber(parsed.textEndInBook),
    quoteHash: optionalString(parsed.quoteHash),
  };
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMemoryKind(value: unknown): ReadingMemoryEntryKind {
  return value === 'summary' ||
    value === 'trace' ||
    value === 'anchor' ||
    value === 'correction' ||
    value === 'reader_signal' ||
    value === 'progress' ||
    value === 'preference' ||
    value === 'retrieval_note'
    ? value
    : 'summary';
}

function normalizeMemoryScope(value: unknown): ReadingMemoryScope {
  return value === 'segment' ||
    value === 'chapter' ||
    value === 'book' ||
    value === 'reader' ||
    value === 'agent'
    ? value
    : 'book';
}

function normalizeMemoryVisibility(value: unknown): ReadingMemoryVisibility {
  return value === 'default' ||
    value === 'hidden' ||
    value === 'agent_private' ||
    value === 'debug_only'
    ? value
    : 'default';
}

function normalizeMemorySourceType(value: unknown): ReadingMemorySourceType {
  return value === 'original_text' ||
    value === 'ai_task' ||
    value === 'annotation' ||
    value === 'comment' ||
    value === 'progress' ||
    value === 'correction' ||
    value === 'import'
    ? value
    : 'import';
}
