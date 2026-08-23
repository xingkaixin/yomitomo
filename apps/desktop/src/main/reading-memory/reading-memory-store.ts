import { performance } from 'node:perf_hooks';
import type { ReadingMemoryEntry, ReadingMemoryView } from '@yomitomo/shared';
import { recordField, uniqueNonEmptyStrings } from '@yomitomo/shared';
import {
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryEntrySearchText,
} from '@yomitomo/core';
import { getSqliteExecutor } from '../store/store-db';
import {
  readingMemoryFtsQuery,
  readingMemoryWhereClause,
  sourceWhereClause,
  structuredMemoryViewCandidateClause,
} from './reading-memory-query-builder';
import {
  readingMemoryEntrySqlValues,
  rowToReadingMemoryEntry,
  type SqliteValue,
} from './reading-memory-row-mapper';
import type {
  BuildReadingMemoryViewOptions,
  ReadingMemoryPerformanceLogger,
  ReadingMemorySqliteExecutor,
  ReadReadingMemoryEntriesOptions,
  SearchReadingMemoryEntriesOptions,
  SoftDeleteReadingMemoryEntriesBySourceOptions,
} from './reading-memory-store-types';
import {
  buildReadingMemoryViewFromCandidates,
  readingMemoryViewLimits,
} from './reading-memory-view-policy';
export type {
  BuildReadingMemoryViewOptions,
  ReadingMemorySqliteExecutor,
  ReadReadingMemoryEntriesOptions,
  SearchReadingMemoryEntriesOptions,
  SoftDeleteReadingMemoryEntriesBySourceOptions,
} from './reading-memory-store-types';

type SqliteStatement = {
  run: (...values: SqliteValue[]) => unknown;
  get: (...values: SqliteValue[]) => unknown;
  all: (...values: SqliteValue[]) => unknown[];
};

type SubstringFallbackResult = {
  entries: ReadingMemoryEntry[];
  candidateCount: number;
};

type ReadingMemoryWriteStatements = {
  insertEntry: SqliteStatement;
  upsertEntry: SqliteStatement;
  insertFts: SqliteStatement;
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
  withReadingMemoryTransaction(database, () => {
    const articleIds = new Set<string>();
    const statements = prepareReadingMemoryWriteStatements(database);
    for (const entry of entries) {
      appendReadingMemoryEntryInTransaction(database, entry, statements);
      articleIds.add(entry.articleId);
    }
    for (const articleId of articleIds) deleteProjectionRows(database, articleId);
  });
}

export function upsertReadingMemoryEntries(
  entries: ReadingMemoryEntry[],
  executor?: ReadingMemorySqliteExecutor,
  options: { useTransaction?: boolean } = {},
) {
  if (entries.length === 0) return;
  const database = executor || defaultExecutor();
  const run = () => {
    const articleIds = new Set<string>();
    const activeEntries: ReadingMemoryEntry[] = [];
    const statements = prepareReadingMemoryWriteStatements(database);
    const normalizedEntries = entries.map((input) => {
      const entry = normalizeReadingMemoryEntry(input);
      if (!entry) throw new Error('阅读记忆 entry 无效');
      return entry;
    });
    deleteFtsRows(
      database,
      normalizedEntries.map((entry) => entry.id),
    );
    for (const entry of normalizedEntries) {
      statements.upsertEntry.run(...readingMemoryEntrySqlValues(entry));
      articleIds.add(entry.articleId);
      if (!entry.deletedAt) activeEntries.push(entry);
    }
    for (const entry of activeEntries) upsertFtsRow(database, entry, statements);
    for (const articleId of articleIds) deleteProjectionRows(database, articleId);
  };
  if (options.useTransaction === false) run();
  else withReadingMemoryTransaction(database, run);
}

export function readReadingMemoryEntries(options: ReadReadingMemoryEntriesOptions) {
  const startedAt = performance.now();
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
  const result = options.applySupersedes === false ? entries : applySupersededEntryFilter(entries);
  logReadingMemoryTiming(options.performanceLogger, 'entry_query', startedAt, {
    articleId: options.articleId,
    kind: options.kind,
    scope: options.scope,
    chapterId: options.chapterId,
    segmentId: options.segmentId,
    includeDeleted: Boolean(options.includeDeleted),
    entryCount: result.length,
  });
  return result;
}

export function searchReadingMemoryEntries(options: SearchReadingMemoryEntriesOptions) {
  const startedAt = performance.now();
  const executor = options.executor || defaultExecutor();
  const query = options.query.trim();
  const ftsQuery = readingMemoryFtsQuery(query);
  if (!ftsQuery) {
    logReadingMemoryTiming(options.performanceLogger, 'fts_query', startedAt, {
      articleId: options.articleId,
      queryLength: query.length,
      entryCount: 0,
    });
    return [];
  }
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
    .all(ftsQuery, options.articleId, limit);
  const ids = rows.map((row) => stringValue(recordField(row, 'entryId'))).filter(Boolean);
  if (ids.length === 0) {
    const fallback = options.fallbackToSubstring
      ? searchReadingMemoryEntriesBySubstring(options, executor, limit)
      : { entries: [], candidateCount: 0 };
    logReadingMemoryTiming(options.performanceLogger, 'fts_query', startedAt, {
      articleId: options.articleId,
      queryLength: query.length,
      limit,
      ...(options.fallbackToSubstring
        ? {
            fallback: 'substring',
            fallbackCandidateCount: fallback.candidateCount,
          }
        : {}),
      entryCount: fallback.entries.length,
    });
    return fallback.entries;
  }

  const entries = readReadingMemoryEntriesByIds({
    articleId: options.articleId,
    ids,
    agentId: options.agentId,
    excludeAgentId: options.excludeAgentId,
    requireAgentId: options.requireAgentId,
    visibility: options.visibility,
    executor,
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const result = ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  logReadingMemoryTiming(options.performanceLogger, 'fts_query', startedAt, {
    articleId: options.articleId,
    queryLength: query.length,
    limit,
    entryCount: result.length,
  });
  return result;
}

function searchReadingMemoryEntriesBySubstring(
  options: SearchReadingMemoryEntriesOptions,
  executor: ReadingMemorySqliteExecutor,
  limit: number,
): SubstringFallbackResult {
  const startedAt = performance.now();
  const query = options.query.trim();
  if (!query) return { entries: [], candidateCount: 0 };
  const { where, values } = readingMemoryWhereClause({
    articleId: options.articleId,
    agentId: options.agentId,
    excludeAgentId: options.excludeAgentId,
    requireAgentId: options.requireAgentId,
    visibility: options.visibility,
  });
  const rows = executor
    .prepare(
      `
SELECT fts.entry_id AS entryId
FROM reading_memory_entry_fts AS fts
WHERE fts.article_id = ?
  AND fts.search_text LIKE ? ESCAPE '\\'
  AND EXISTS (
    SELECT 1
    FROM reading_memory_entries
    ${where}
      AND reading_memory_entries.id = fts.entry_id
  )
ORDER BY fts.rowid ASC
LIMIT ?
`,
    )
    .all(options.articleId, `%${escapeSqlLike(query)}%`, ...values, limit);
  const ids = rows.map((row) => stringValue(recordField(row, 'entryId'))).filter(Boolean);
  const entries = readReadingMemoryEntriesByIds({
    articleId: options.articleId,
    ids,
    agentId: options.agentId,
    excludeAgentId: options.excludeAgentId,
    requireAgentId: options.requireAgentId,
    visibility: options.visibility,
    executor,
  });
  logReadingMemoryTiming(options.performanceLogger, 'substring_fallback', startedAt, {
    articleId: options.articleId,
    queryLength: query.length,
    limit,
    candidateCount: ids.length,
    entryCount: entries.length,
  });
  return { entries, candidateCount: ids.length };
}

function readReadingMemoryEntriesByIds(
  options: Pick<
    SearchReadingMemoryEntriesOptions,
    'articleId' | 'agentId' | 'excludeAgentId' | 'requireAgentId' | 'visibility' | 'executor'
  > & { ids: string[] },
) {
  const ids = uniqueNonEmptyStrings(options.ids);
  if (ids.length === 0) return [];
  const executor = options.executor || defaultExecutor();
  const { where, values } = readingMemoryWhereClause({
    articleId: options.articleId,
    agentId: options.agentId,
    excludeAgentId: options.excludeAgentId,
    requireAgentId: options.requireAgentId,
    visibility: options.visibility,
  });
  const placeholders = questionMarks(ids.length);
  const rows = executor
    .prepare(
      `
SELECT *
FROM reading_memory_entries
${where}
  AND (id IN (${placeholders}) OR supersedes_entry_id IN (${placeholders}))
ORDER BY created_at ASC, id ASC
`,
    )
    .all(...values, ...ids, ...ids);
  const entries = rows.flatMap((row) => {
    const entry = rowToReadingMemoryEntry(row);
    return entry ? [entry] : [];
  });
  return applySupersededEntryFilter(entries);
}

export function buildReadingMemoryView(options: BuildReadingMemoryViewOptions): ReadingMemoryView {
  const startedAt = performance.now();
  const executor = options.executor || defaultExecutor();
  const limits = readingMemoryViewLimits(options);
  const structuredCandidates = readStructuredMemoryViewCandidates(options, executor);
  const query = options.query?.trim();
  const searchCandidates = query
    ? searchReadingMemoryEntries({
        articleId: options.articleId,
        query,
        limit: limits.fts * 3,
        performanceLogger: options.performanceLogger,
        executor,
      })
    : [];
  const view = buildReadingMemoryViewFromCandidates({
    options,
    searchCandidates,
    structuredCandidates,
  });
  logReadingMemoryTiming(options.performanceLogger, 'view_build', startedAt, {
    articleId: options.articleId,
    viewType: options.viewType,
    viewKey: view.viewKey,
    structuredCount: view.entries.filter((item) => item.source === 'structured').length,
    ftsCount: view.entries.filter((item) => item.source === 'fts').length,
    entryCount: view.entries.length,
  });
  return view;
}

function readStructuredMemoryViewCandidates(
  options: BuildReadingMemoryViewOptions,
  executor: ReadingMemorySqliteExecutor,
) {
  const startedAt = performance.now();
  const candidate = structuredMemoryViewCandidateClause(options);
  const rows = executor
    .prepare(
      `
SELECT *
FROM reading_memory_entries
WHERE article_id = ?
  AND deleted_at IS NULL
  AND ((${candidate.where}) OR supersedes_entry_id IS NOT NULL)
ORDER BY created_at ASC, id ASC
`,
    )
    .all(options.articleId, ...candidate.values);
  const entries = rows.flatMap((row) => {
    const entry = rowToReadingMemoryEntry(row);
    return entry ? [entry] : [];
  });
  const result = applySupersededEntryFilter(entries);
  logReadingMemoryTiming(options.performanceLogger, 'entry_query', startedAt, {
    articleId: options.articleId,
    viewType: options.viewType,
    chapterId: options.chapterId,
    segmentId: options.segmentId,
    includeDeleted: false,
    entryCount: result.length,
  });
  return result;
}

export function softDeleteReadingMemoryEntriesBySource(
  options: SoftDeleteReadingMemoryEntriesBySourceOptions,
) {
  const executor = options.executor || defaultExecutor();
  const deletedAt = options.deletedAt || new Date().toISOString();
  const { where, values } = sourceWhereClause(options);
  if (!where) return 0;

  const run = () => {
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
      .map((row) => stringValue(recordField(row, 'id')));
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
  };
  return options.useTransaction === false ? run() : withReadingMemoryTransaction(executor, run);
}

export function deleteReadingMemoryForArticle(
  articleId: string,
  executor?: ReadingMemorySqliteExecutor,
  options: { useTransaction?: boolean } = {},
) {
  const database = executor || defaultExecutor();
  const run = () => {
    database.prepare('DELETE FROM reading_memory_entry_fts WHERE article_id = ?').run(articleId);
    database.prepare('DELETE FROM reading_memory_projections WHERE article_id = ?').run(articleId);
    database.prepare('DELETE FROM reading_memory_entries WHERE article_id = ?').run(articleId);
  };
  if (options.useTransaction === false) run();
  else withReadingMemoryTransaction(database, run);
}

export function rebuildReadingMemoryFts(
  articleId?: string,
  executor?: ReadingMemorySqliteExecutor,
) {
  const database = executor || defaultExecutor();
  withReadingMemoryTransaction(database, () => {
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
  statements = prepareReadingMemoryWriteStatements(executor),
) {
  const entry = normalizeReadingMemoryEntry(input);
  if (!entry) throw new Error('阅读记忆 entry 无效');
  statements.insertEntry.run(...readingMemoryEntrySqlValues(entry));
  if (!entry.deletedAt) upsertFtsRow(executor, entry, statements);
}

function prepareReadingMemoryWriteStatements(
  executor: ReadingMemorySqliteExecutor,
): ReadingMemoryWriteStatements {
  return {
    insertEntry: executor.prepare(READING_MEMORY_INSERT_SQL),
    upsertEntry: executor.prepare(READING_MEMORY_UPSERT_SQL),
    insertFts: executor.prepare(READING_MEMORY_FTS_INSERT_SQL),
  };
}

const READING_MEMORY_INSERT_SQL = `
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
`;

const READING_MEMORY_UPSERT_SQL = `
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
ON CONFLICT(id) DO UPDATE SET
  article_id = excluded.article_id,
  kind = excluded.kind,
  scope = excluded.scope,
  visibility = excluded.visibility,
  payload_version = excluded.payload_version,
  chapter_id = excluded.chapter_id,
  segment_id = excluded.segment_id,
  paragraph_id = excluded.paragraph_id,
  text_start = excluded.text_start,
  text_end = excluded.text_end,
  agent_id = excluded.agent_id,
  reader_id = excluded.reader_id,
  source_type = excluded.source_type,
  source_id = excluded.source_id,
  source_annotation_id = excluded.source_annotation_id,
  source_comment_id = excluded.source_comment_id,
  source_task_id = excluded.source_task_id,
  source_entry_ids = excluded.source_entry_ids,
  supersedes_entry_id = excluded.supersedes_entry_id,
  anchor = excluded.anchor,
  payload = excluded.payload,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at,
  deletion_reason = excluded.deletion_reason
`;

const READING_MEMORY_FTS_INSERT_SQL = `
INSERT INTO reading_memory_entry_fts (entry_id, article_id, kind, scope, search_text)
VALUES (?, ?, ?, ?, ?)
`;

function upsertFtsRow(
  executor: ReadingMemorySqliteExecutor,
  entry: ReadingMemoryEntry,
  statements?: Pick<ReadingMemoryWriteStatements, 'insertFts'>,
) {
  const searchText = readingMemoryEntrySearchText(entry);
  if (!searchText) return;
  const statement = statements?.insertFts || executor.prepare(READING_MEMORY_FTS_INSERT_SQL);
  statement.run(entry.id, entry.articleId, entry.kind, entry.scope, searchText);
}

function deleteFtsRows(executor: ReadingMemorySqliteExecutor, entryIds: string[]) {
  const ids = uniqueNonEmptyStrings(entryIds);
  if (ids.length === 0) return;
  for (const chunk of chunks(ids, 200)) {
    executor
      .prepare(
        `DELETE FROM reading_memory_entry_fts WHERE entry_id IN (${questionMarks(chunk.length)})`,
      )
      .run(...chunk);
  }
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

function logReadingMemoryTiming(
  logger: ReadingMemoryPerformanceLogger | undefined,
  phase: string,
  startedAt: number,
  data: Record<string, unknown>,
) {
  logger?.(`performance.reading_memory.${phase}`, {
    ...data,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
}

export function withReadingMemoryTransaction<T>(
  executor: ReadingMemorySqliteExecutor,
  callback: () => T,
): T {
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

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function questionMarks(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function escapeSqlLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
