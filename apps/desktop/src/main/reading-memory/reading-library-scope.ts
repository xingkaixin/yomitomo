import {
  projectableReadingCommentAuthorKind,
  selectProjectableReadingJudgments,
} from '@yomitomo/core';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import {
  finiteNumberFieldOrZero,
  recordField,
  stringField,
  uniqueNonEmptyStrings,
} from '@yomitomo/shared';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const scopeReadBatchSize = 64;

export function readReadingLibraryScopeIdentity(
  executor: ReadingMemorySqliteExecutor,
  requestedScope: ReadingEvidenceScope,
) {
  const scope = normalizeScope(requestedScope);
  let collectionName: string | undefined;
  if (scope.kind === 'collection') {
    const collection = executor
      .prepare('SELECT name FROM collections WHERE id = ?')
      .get(scope.collectionId);
    if (!collection) throw new Error('READING_MEMORY_SCOPE_NOT_FOUND');
    collectionName = stringField(recordField(collection, 'name'));
  }

  return { scope, ...(collectionName === undefined ? {} : { collectionName }) };
}

export function readReadingLibraryScope(
  executor: ReadingMemorySqliteExecutor,
  requestedScope: ReadingEvidenceScope,
) {
  const identity = readReadingLibraryScopeIdentity(executor, requestedScope);
  const articles = scopedArticles(identity.scope);
  const count = executor
    .prepare(`SELECT COUNT(*) AS count FROM (${articles.sql})`)
    .get(...articles.values);
  const sourceCount = finiteNumberFieldOrZero(recordField(count, 'count'));
  const result = {
    ...identity,
    sourceCount,
    judgmentCount: 0,
  };
  if (sourceCount === 0) return result;

  const annotations = readScopeRows(
    executor,
    `SELECT source.id, source.distillation_status, source.distillation_content
FROM annotations AS source
WHERE EXISTS (SELECT 1 FROM (${articles.sql}) AS allowed WHERE allowed.id = source.article_id)`,
    articles.values,
  );
  for (const row of annotations) {
    const { distillationContent } = selectProjectableReadingJudgments({
      comments: [],
      distillation: {
        status:
          recordField(row, 'distillation_status') === 'published' ? 'published' : 'unpublished',
        content: stringField(recordField(row, 'distillation_content')),
      },
    });
    if (distillationContent) result.judgmentCount += 1;
  }

  const commentRows = readScopeRows(
    executor,
    `SELECT source.id, source.annotation_id, source.author, source.content, source.pending
FROM comments AS source
WHERE EXISTS (
  SELECT 1 FROM annotations AS annotation
  WHERE annotation.id = source.annotation_id AND annotation.article_id IN (${articles.sql})
)`,
    articles.values,
  );
  const commentsByAnnotation = new Map<string, { count: number; hasUser: boolean }>();
  for (const row of commentRows) {
    const authorKind = projectableReadingCommentAuthorKind(commentFromRow(row));
    if (authorKind === null) continue;
    const annotationId = stringField(recordField(row, 'annotation_id'));
    const comments = commentsByAnnotation.get(annotationId) || { count: 0, hasUser: false };
    comments.count += 1;
    comments.hasUser ||= authorKind === 'user';
    commentsByAnnotation.set(annotationId, comments);
  }
  for (const comments of commentsByAnnotation.values()) {
    if (comments.hasUser) result.judgmentCount += comments.count;
  }
  return result;
}

function* readScopeRows(executor: ReadingMemorySqliteExecutor, query: string, values: string[]) {
  const first = executor.prepare(`${query} ORDER BY source.id LIMIT ${scopeReadBatchSize}`);
  const next = executor.prepare(
    `${query} AND source.id > ? ORDER BY source.id LIMIT ${scopeReadBatchSize}`,
  );
  let rows = first.all(...values);
  while (rows.length > 0) {
    const lastId = stringField(recordField(rows[rows.length - 1], 'id'));
    yield* rows;
    if (rows.length < scopeReadBatchSize) return;
    rows = next.all(...values, lastId);
  }
}

function normalizeScope(scope: ReadingEvidenceScope): ReadingEvidenceScope {
  if (scope.kind === 'library') return { kind: 'library' };
  if (scope.kind === 'collection') return { kind: 'collection', collectionId: scope.collectionId };
  return {
    kind: 'sources',
    sources: uniqueNonEmptyStrings(
      scope.sources.flatMap((source) => (source.kind === 'article' ? [source.id] : [])),
    )
      .toSorted()
      .map((id) => ({ kind: 'article', id })),
  };
}

function scopedArticles(scope: ReadingEvidenceScope) {
  if (scope.kind === 'library') return { sql: 'SELECT id FROM articles', values: [] };
  if (scope.kind === 'collection') {
    return {
      sql: `SELECT article.id FROM articles AS article
WHERE EXISTS (
  SELECT 1 FROM collection_members AS member
  WHERE member.collection_id = ?
    AND member.member_kind = 'article'
    AND member.member_id = article.id
)`,
      values: [scope.collectionId],
    };
  }
  return {
    sql: 'SELECT id FROM articles WHERE id IN (SELECT value FROM json_each(?))',
    values: [JSON.stringify(scope.sources.map((source) => source.id))],
  };
}

function commentFromRow(row: unknown) {
  const pending = recordField(row, 'pending');
  return {
    author: {
      kind: recordField(row, 'author') === 'ai' ? ('agent' as const) : ('user' as const),
    },
    content: stringField(recordField(row, 'content')),
    pending: pending === true || pending === 1,
  };
}
