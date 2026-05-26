import type { ReadingMemoryEntry, TextAnchor } from '@yomitomo/shared';
import {
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryEntrySearchText,
} from '@yomitomo/core';
import { getSqliteExecutor } from './store-db';

type SqliteValue = string | number | null;
type SqliteStatement = {
  run: (...values: SqliteValue[]) => unknown;
  get: (...values: SqliteValue[]) => unknown;
  all: (...values: SqliteValue[]) => unknown[];
};
export type ReadingMemorySqliteExecutor = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
};

export type ReadReadingMemoryEntriesOptions = {
  articleId: string;
  kind?: ReadingMemoryEntry['kind'];
  scope?: ReadingMemoryEntry['scope'];
  chapterId?: string;
  segmentId?: string;
  includeDeleted?: boolean;
  applySupersedes?: boolean;
  executor?: ReadingMemorySqliteExecutor;
};

export type SearchReadingMemoryEntriesOptions = {
  articleId: string;
  query: string;
  limit?: number;
  executor?: ReadingMemorySqliteExecutor;
};

export type SoftDeleteReadingMemoryEntriesBySourceOptions = {
  articleId: string;
  sourceAnnotationId?: string;
  sourceCommentId?: string;
  sourceType?: ReadingMemoryEntry['sourceType'];
  sourceId?: string;
  deletedAt?: string;
  deletionReason: string;
  executor?: ReadingMemorySqliteExecutor;
};

export function appendReadingMemoryEntry(
  entry: ReadingMemoryEntry,
  executor?: ReadingMemorySqliteExecutor,
) {
  appendReadingMemoryEntries([entry], executor);
}

export function appendReadingMemoryEntries(
  entries: ReadingMemoryEntry[],
  executor?: ReadingMemorySqliteExecutor,
) {
  if (entries.length === 0) return;
  const database = executor || defaultExecutor();
  withTransaction(database, () => {
    const articleIds = new Set<string>();
    for (const entry of entries) {
      appendReadingMemoryEntryInTransaction(database, entry);
      articleIds.add(entry.articleId);
    }
    for (const articleId of articleIds) deleteProjectionRows(database, articleId);
  });
}

export function readReadingMemoryEntries(options: ReadReadingMemoryEntriesOptions) {
  const executor = options.executor || defaultExecutor();
  const { where, values } = readingMemoryWhereClause(options);
  const rows = executor
    .prepare(
      `
SELECT *
FROM reading_memory_entries
${where}
ORDER BY created_at ASC, id ASC
`,
    )
    .all(...values);
  const entries = rows.flatMap((row) => {
    const entry = rowToReadingMemoryEntry(row);
    return entry ? [entry] : [];
  });
  return options.applySupersedes === false ? entries : applySupersededEntryFilter(entries);
}

export function searchReadingMemoryEntries(options: SearchReadingMemoryEntriesOptions) {
  const executor = options.executor || defaultExecutor();
  const query = options.query.trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(options.limit || 20, 100));
  const rows = executor
    .prepare(
      `
SELECT entry_id AS entryId
FROM reading_memory_entry_fts
WHERE reading_memory_entry_fts MATCH ?
  AND article_id = ?
ORDER BY bm25(reading_memory_entry_fts)
LIMIT ?
`,
    )
    .all(query, options.articleId, limit) as Array<{ entryId: string }>;
  const ids = rows.map((row) => row.entryId).filter(Boolean);
  if (ids.length === 0) return [];

  const entries = readReadingMemoryEntries({
    articleId: options.articleId,
    executor,
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

export function softDeleteReadingMemoryEntriesBySource(
  options: SoftDeleteReadingMemoryEntriesBySourceOptions,
) {
  const executor = options.executor || defaultExecutor();
  const deletedAt = options.deletedAt || new Date().toISOString();
  const { where, values } = sourceWhereClause(options);
  if (!where) return 0;

  return withTransaction(executor, () => {
    const ids = executor
      .prepare(
        `
SELECT id
FROM reading_memory_entries
WHERE article_id = ?
  AND deleted_at IS NULL
  AND (${where})
`,
      )
      .all(options.articleId, ...values)
      .map((row) => String((row as { id: string }).id));
    if (ids.length === 0) return 0;

    executor
      .prepare(
        `
UPDATE reading_memory_entries
SET deleted_at = ?, deletion_reason = ?, updated_at = ?
WHERE article_id = ?
  AND deleted_at IS NULL
  AND (${where})
`,
      )
      .run(deletedAt, options.deletionReason, deletedAt, options.articleId, ...values);
    deleteFtsRows(executor, ids);
    deleteProjectionRows(executor, options.articleId);
    return ids.length;
  });
}

export function deleteReadingMemoryForArticle(
  articleId: string,
  executor?: ReadingMemorySqliteExecutor,
) {
  const database = executor || defaultExecutor();
  withTransaction(database, () => {
    database.prepare('DELETE FROM reading_memory_entry_fts WHERE article_id = ?').run(articleId);
    database.prepare('DELETE FROM reading_memory_projections WHERE article_id = ?').run(articleId);
    database.prepare('DELETE FROM reading_memory_entries WHERE article_id = ?').run(articleId);
  });
}

export function rebuildReadingMemoryFts(
  articleId?: string,
  executor?: ReadingMemorySqliteExecutor,
) {
  const database = executor || defaultExecutor();
  withTransaction(database, () => {
    if (articleId) {
      database.prepare('DELETE FROM reading_memory_entry_fts WHERE article_id = ?').run(articleId);
    } else database.prepare('DELETE FROM reading_memory_entry_fts').run();

    const entries = readActiveRowsForFtsRebuild(database, articleId);
    for (const entry of entries) upsertFtsRow(database, entry);
  });
}

function defaultExecutor(): ReadingMemorySqliteExecutor {
  return getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor;
}

function appendReadingMemoryEntryInTransaction(
  executor: ReadingMemorySqliteExecutor,
  input: ReadingMemoryEntry,
) {
  const entry = normalizeReadingMemoryEntry(input);
  if (!entry) throw new Error('阅读记忆 entry 无效');
  executor
    .prepare(
      `
INSERT INTO reading_memory_entries (
  id,
  article_id,
  kind,
  scope,
  visibility,
  payload_version,
  chapter_id,
  segment_id,
  paragraph_id,
  text_start,
  text_end,
  agent_id,
  reader_id,
  source_type,
  source_id,
  source_annotation_id,
  source_comment_id,
  source_task_id,
  source_entry_ids,
  supersedes_entry_id,
  anchor,
  payload,
  created_at,
  updated_at,
  deleted_at,
  deletion_reason
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
    )
    .run(
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
    );
  if (!entry.deletedAt) upsertFtsRow(executor, entry);
}

function upsertFtsRow(executor: ReadingMemorySqliteExecutor, entry: ReadingMemoryEntry) {
  const searchText = readingMemoryEntrySearchText(entry);
  if (!searchText) return;
  executor
    .prepare(
      `
INSERT INTO reading_memory_entry_fts (entry_id, article_id, kind, scope, search_text)
VALUES (?, ?, ?, ?, ?)
`,
    )
    .run(entry.id, entry.articleId, entry.kind, entry.scope, searchText);
}

function deleteFtsRows(executor: ReadingMemorySqliteExecutor, entryIds: string[]) {
  const statement = executor.prepare('DELETE FROM reading_memory_entry_fts WHERE entry_id = ?');
  for (const id of entryIds) statement.run(id);
}

function deleteProjectionRows(executor: ReadingMemorySqliteExecutor, articleId: string) {
  executor.prepare('DELETE FROM reading_memory_projections WHERE article_id = ?').run(articleId);
}

function readActiveRowsForFtsRebuild(
  executor: ReadingMemorySqliteExecutor,
  articleId: string | undefined,
) {
  const rows = articleId
    ? executor
        .prepare(
          `
SELECT *
FROM reading_memory_entries
WHERE article_id = ?
  AND deleted_at IS NULL
ORDER BY created_at ASC, id ASC
`,
        )
        .all(articleId)
    : executor
        .prepare(
          `
SELECT *
FROM reading_memory_entries
WHERE deleted_at IS NULL
ORDER BY created_at ASC, id ASC
`,
        )
        .all();
  return rows.flatMap((row) => {
    const entry = rowToReadingMemoryEntry(row);
    return entry ? [entry] : [];
  });
}

function readingMemoryWhereClause(options: ReadReadingMemoryEntriesOptions) {
  const clauses = ['article_id = ?'];
  const values: SqliteValue[] = [options.articleId];
  if (options.kind) {
    clauses.push('kind = ?');
    values.push(options.kind);
  }
  if (options.scope) {
    clauses.push('scope = ?');
    values.push(options.scope);
  }
  if (options.chapterId) {
    clauses.push('chapter_id = ?');
    values.push(options.chapterId);
  }
  if (options.segmentId) {
    clauses.push('segment_id = ?');
    values.push(options.segmentId);
  }
  if (!options.includeDeleted) clauses.push('deleted_at IS NULL');
  return { where: `WHERE ${clauses.join('\n  AND ')}`, values };
}

function sourceWhereClause(options: SoftDeleteReadingMemoryEntriesBySourceOptions) {
  const clauses: string[] = [];
  const values: SqliteValue[] = [];
  if (options.sourceAnnotationId) {
    clauses.push('source_annotation_id = ?');
    values.push(options.sourceAnnotationId);
  }
  if (options.sourceCommentId) {
    clauses.push('source_comment_id = ?');
    values.push(options.sourceCommentId);
  }
  if (options.sourceType && options.sourceId) {
    clauses.push('(source_type = ? AND source_id = ?)');
    values.push(options.sourceType, options.sourceId);
  }
  return { where: clauses.join(' OR '), values };
}

function rowToReadingMemoryEntry(row: unknown): ReadingMemoryEntry | null {
  const value = row as Record<string, unknown>;
  const textStart = integerValue(value.text_start);
  const textEnd = integerValue(value.text_end);
  return normalizeReadingMemoryEntry({
    id: stringValue(value.id),
    articleId: stringValue(value.article_id),
    kind: stringValue(value.kind) as ReadingMemoryEntry['kind'],
    scope: stringValue(value.scope) as ReadingMemoryEntry['scope'],
    visibility: stringValue(value.visibility) as ReadingMemoryEntry['visibility'],
    payloadVersion: numberValue(value.payload_version),
    chapterId: optionalString(value.chapter_id),
    segmentId: optionalString(value.segment_id),
    paragraphId: optionalString(value.paragraph_id),
    textRange: textStart !== null && textEnd !== null ? { textStart, textEnd } : undefined,
    agentId: optionalString(value.agent_id),
    readerId: optionalString(value.reader_id),
    sourceType: stringValue(value.source_type) as ReadingMemoryEntry['sourceType'],
    sourceId: optionalString(value.source_id),
    sourceAnnotationId: optionalString(value.source_annotation_id),
    sourceCommentId: optionalString(value.source_comment_id),
    sourceTaskId: optionalString(value.source_task_id),
    sourceEntryIds: jsonValue<string[]>(value.source_entry_ids, []),
    supersedesEntryId: optionalString(value.supersedes_entry_id),
    anchor: jsonValue<TextAnchor | undefined>(value.anchor, undefined),
    payload: jsonValue<Record<string, unknown>>(value.payload, {}),
    createdAt: stringValue(value.created_at),
    updatedAt: stringValue(value.updated_at),
    deletedAt: optionalString(value.deleted_at),
    deletionReason: optionalString(value.deletion_reason),
  });
}

function withTransaction<T>(executor: ReadingMemorySqliteExecutor, callback: () => T): T {
  executor.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    executor.exec('COMMIT');
    return result;
  } catch (error) {
    executor.exec('ROLLBACK');
    throw error;
  }
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
  const number = numberValue(value);
  return Number.isInteger(number) ? number : null;
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
