import { performance } from 'node:perf_hooks';
import type {
  MemoryViewType,
  ReaderProgress,
  ReadingMemoryEntry,
  ReadingMemoryView,
  TextAnchor,
  TextRange,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import {
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryCorrectionEntry,
  readingMemoryEntrySearchText,
} from '@yomitomo/core';
import { getSqliteExecutor } from './store-db';
import {
  readingMemoryFtsQuery,
  readingMemoryWhereClause,
  sourceWhereClause,
} from './reading-memory-query-builder';
import {
  readingMemoryEntrySqlValues,
  rowToReadingMemoryEntry,
  type SqliteValue,
} from './reading-memory-row-mapper';

type PerformanceLogger = (event: string, data?: Record<string, unknown>) => void;
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
  agentId?: string;
  excludeAgentId?: string;
  requireAgentId?: boolean;
  visibility?: ReadingMemoryEntry['visibility'][];
  chapterId?: string;
  segmentId?: string;
  includeDeleted?: boolean;
  applySupersedes?: boolean;
  performanceLogger?: PerformanceLogger;
  executor?: ReadingMemorySqliteExecutor;
};

export type SearchReadingMemoryEntriesOptions = {
  articleId: string;
  query: string;
  agentId?: string;
  excludeAgentId?: string;
  requireAgentId?: boolean;
  visibility?: ReadingMemoryEntry['visibility'][];
  fallbackToSubstring?: boolean;
  limit?: number;
  performanceLogger?: PerformanceLogger;
  executor?: ReadingMemorySqliteExecutor;
};

export type BuildReadingMemoryViewOptions = {
  articleId: string;
  viewType: Extract<
    MemoryViewType,
    'selection' | 'selection_thread' | 'article_section' | 'segment' | 'chapter'
  >;
  chapterId?: string;
  segmentId?: string;
  textRange?: TextRange;
  query?: string;
  readerProgress?: ReaderProgress;
  structuredLimit?: number;
  ftsLimit?: number;
  performanceLogger?: PerformanceLogger;
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
  useTransaction?: boolean;
};

export type AppendReadingMemoryCorrectionOptions = {
  articleId: string;
  targetEntryId: string;
  reason: string;
  replacement?: unknown;
  readerId?: string;
  anchor?: TextAnchor;
  createdAt?: string;
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
  withReadingMemoryTransaction(database, () => {
    const articleIds = new Set<string>();
    for (const entry of entries) {
      appendReadingMemoryEntryInTransaction(database, entry);
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
    for (const entry of entries) {
      upsertReadingMemoryEntryInTransaction(database, entry);
      articleIds.add(entry.articleId);
    }
    for (const articleId of articleIds) deleteProjectionRows(database, articleId);
  };
  if (options.useTransaction === false) run();
  else withReadingMemoryTransaction(database, run);
}

export function appendReadingMemoryCorrection(options: AppendReadingMemoryCorrectionOptions) {
  const executor = options.executor || defaultExecutor();
  return withReadingMemoryTransaction(executor, () => {
    const target = readReadingMemoryEntries({
      articleId: options.articleId,
      includeDeleted: false,
      applySupersedes: false,
      executor,
    }).find((entry) => entry.id === options.targetEntryId);
    if (!target) return null;

    const correction = readingMemoryCorrectionEntry({
      id: makeId('reading_memory_correction'),
      articleId: options.articleId,
      targetEntry: target,
      reason: options.reason,
      replacement: options.replacement,
      readerId: options.readerId,
      anchor: options.anchor,
      createdAt: options.createdAt || new Date().toISOString(),
    });
    if (!correction) return null;

    appendReadingMemoryEntryInTransaction(executor, correction);
    deleteProjectionRows(executor, options.articleId);
    return correction;
  });
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
      : [];
    logReadingMemoryTiming(options.performanceLogger, 'fts_query', startedAt, {
      articleId: options.articleId,
      queryLength: query.length,
      fallback: 'substring',
      entryCount: fallback.length,
    });
    return fallback;
  }

  const entries = readReadingMemoryEntries({
    articleId: options.articleId,
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
) {
  const query = options.query.trim().toLocaleLowerCase();
  if (!query) return [];
  return readReadingMemoryEntries({
    articleId: options.articleId,
    agentId: options.agentId,
    excludeAgentId: options.excludeAgentId,
    requireAgentId: options.requireAgentId,
    visibility: options.visibility,
    executor,
  })
    .filter((entry) => readingMemoryEntrySearchText(entry).toLocaleLowerCase().includes(query))
    .slice(0, limit);
}

export function buildReadingMemoryView(options: BuildReadingMemoryViewOptions): ReadingMemoryView {
  const startedAt = performance.now();
  const executor = options.executor || defaultExecutor();
  const structuredLimit = normalizeLimit(options.structuredLimit, 12, 50);
  const ftsLimit = normalizeLimit(options.ftsLimit, 5, 20);
  const structured = readReadingMemoryEntries({
    articleId: options.articleId,
    includeDeleted: false,
    performanceLogger: options.performanceLogger,
    executor,
  })
    .filter((entry) => structuredMemoryViewEntry(entry, options))
    .toSorted(memoryViewEntryOrder)
    .slice(-structuredLimit);

  const entries: ReadingMemoryView['entries'] = structured.map((entry) => ({
    entry,
    source: 'structured',
  }));
  const seenIds = new Set(structured.map((entry) => entry.id));
  const seenProvenance = new Set(structured.map(memoryEntryProvenanceKey));

  const query = options.query?.trim();
  if (query) {
    for (const entry of searchReadingMemoryEntries({
      articleId: options.articleId,
      query,
      limit: ftsLimit * 3,
      performanceLogger: options.performanceLogger,
      executor,
    })) {
      if (entries.length >= structured.length + ftsLimit) break;
      if (seenIds.has(entry.id)) continue;
      if (!memoryEntryAllowedByProgress(entry, options.readerProgress)) continue;
      if (!memoryEntryAllowedForView(entry, options)) continue;

      const provenanceKey = memoryEntryProvenanceKey(entry);
      if (seenProvenance.has(provenanceKey)) continue;
      seenIds.add(entry.id);
      seenProvenance.add(provenanceKey);
      entries.push({ entry, source: 'fts' as const });
    }
  }

  const view = {
    articleId: options.articleId,
    viewType: options.viewType,
    viewKey: memoryViewKey(options),
    entries,
    sourceEntryIds: entries.map((item) => item.entry.id),
    updatedAt: latestMemoryEntryUpdatedAt(entries.map((item) => item.entry)),
  };
  logReadingMemoryTiming(options.performanceLogger, 'view_build', startedAt, {
    articleId: options.articleId,
    viewType: options.viewType,
    viewKey: view.viewKey,
    structuredCount: structured.length,
    ftsCount: entries.filter((item) => item.source === 'fts').length,
    entryCount: entries.length,
  });
  return view;
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
    .run(...readingMemoryEntrySqlValues(entry));
  if (!entry.deletedAt) upsertFtsRow(executor, entry);
}

function upsertReadingMemoryEntryInTransaction(
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
`,
    )
    .run(...readingMemoryEntrySqlValues(entry));
  deleteFtsRows(executor, [entry.id]);
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

function structuredMemoryViewEntry(
  entry: ReadingMemoryEntry,
  options: BuildReadingMemoryViewOptions,
) {
  if (!memoryEntryAllowedForView(entry, options)) return false;
  return memoryEntryAllowedByProgress(entry, options.readerProgress);
}

function memoryEntryAllowedForView(
  entry: ReadingMemoryEntry,
  options: BuildReadingMemoryViewOptions,
) {
  if (
    entry.kind !== 'summary' &&
    entry.kind !== 'trace' &&
    entry.kind !== 'correction' &&
    entry.kind !== 'reader_signal'
  ) {
    return false;
  }

  if (options.viewType === 'selection' || options.viewType === 'selection_thread') {
    if (options.chapterId && entry.chapterId && entry.chapterId !== options.chapterId) return false;
    if (!options.textRange || !entry.textRange) return true;
    return rangesNear(entry.textRange, options.textRange, 2400);
  }

  if (options.viewType === 'article_section') {
    if (!options.textRange || !entry.textRange) return true;
    return rangesNear(entry.textRange, options.textRange, 2400);
  }

  if (options.viewType === 'segment') {
    if (entry.scope !== 'segment' && entry.scope !== 'chapter' && entry.scope !== 'reader') {
      return false;
    }
    if (options.chapterId && entry.chapterId && entry.chapterId !== options.chapterId) return false;
    if (!options.textRange || !entry.textRange) return true;
    return entry.textRange.textEnd <= options.textRange.textEnd;
  }

  if (options.viewType === 'chapter') {
    if (entry.scope !== 'chapter' && entry.scope !== 'segment' && entry.scope !== 'reader') {
      return false;
    }
    return !options.chapterId || !entry.chapterId || entry.chapterId === options.chapterId;
  }

  return false;
}

function memoryEntryAllowedByProgress(
  entry: ReadingMemoryEntry,
  progress: ReaderProgress | undefined,
) {
  if (!progress) return true;
  if (entry.chapterId && progress.readChapterIds.includes(entry.chapterId)) return true;
  if (entry.chapterId && entry.chapterId !== progress.currentChapterId) return false;
  if (progress.readUntilTextOffset === undefined || !entry.textRange) return true;
  return entry.textRange.textEnd <= progress.readUntilTextOffset;
}

function memoryViewEntryOrder(left: ReadingMemoryEntry, right: ReadingMemoryEntry) {
  const leftStart = left.textRange?.textStart ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.textRange?.textStart ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) return leftStart - rightStart;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt.localeCompare(right.updatedAt);
  return left.id.localeCompare(right.id);
}

function rangesNear(left: TextRange, right: TextRange, distance: number) {
  if (left.textEnd < right.textStart) return right.textStart - left.textEnd <= distance;
  if (right.textEnd < left.textStart) return left.textStart - right.textEnd <= distance;
  return true;
}

function memoryEntryProvenanceKey(entry: ReadingMemoryEntry) {
  return [
    entry.sourceType,
    entry.sourceId || '',
    entry.sourceTaskId || '',
    entry.supersedesEntryId || '',
    entry.sourceEntryIds.join(','),
    entry.chapterId || '',
    entry.segmentId || '',
    entry.textRange?.textStart ?? '',
    entry.textRange?.textEnd ?? '',
  ].join(':');
}

function memoryViewKey(options: BuildReadingMemoryViewOptions) {
  return [
    options.viewType,
    options.chapterId || '',
    options.segmentId || '',
    options.textRange?.textStart ?? '',
    options.textRange?.textEnd ?? '',
  ].join(':');
}

function latestMemoryEntryUpdatedAt(entries: ReadingMemoryEntry[]) {
  return entries.reduce((latest, entry) => {
    if (!latest || entry.updatedAt > latest) return entry.updatedAt;
    return latest;
  }, '');
}

function normalizeLimit(value: number | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(value || fallback, max));
}

function logReadingMemoryTiming(
  logger: PerformanceLogger | undefined,
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

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
