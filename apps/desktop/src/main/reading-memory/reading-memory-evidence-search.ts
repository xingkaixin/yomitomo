import type {
  ReadingEvidence,
  ReadingEvidenceProjectionState,
  ReadingEvidenceProjectionStatus,
  ReadingEvidenceScope,
} from '@yomitomo/shared';
import {
  finiteNumberFieldOrZero,
  normalizeArticleSourceType,
  recordField,
  stringField,
  uniqueNonEmptyStrings,
} from '@yomitomo/shared';
import {
  materializeReadingEvidence,
  projectReadingEvidenceThread,
  rankReadingEvidenceCandidates,
  type ProjectedReadingEvidenceEntry,
} from '@yomitomo/core';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const annotationThreadTargetType = 'annotation_thread';
const defaultResultLimit = 12;
const maximumResultLimit = 24;
const candidateLimit = 40;

type SearchReadingEvidenceOptions = {
  query: string;
  scope: ReadingEvidenceScope;
  limit?: number;
  executor: ReadingMemorySqliteExecutor;
};

type ReadReadingEvidenceProjectionStatusOptions = {
  scope: ReadingEvidenceScope;
  executor: ReadingMemorySqliteExecutor;
};

export type ReadingEvidenceCandidate = {
  id: string;
  articleId: string;
  targetId: string;
  sourceVersion: string;
};

type ArticleMetadata = {
  id: string;
  sourceType: ReturnType<typeof normalizeArticleSourceType>;
  title: string;
  byline?: string;
};

type SqlFilter = {
  sql: string;
  values: string[];
};

type ProjectionCounts = {
  total: number;
  projected: number;
  receipt: number;
  stale: number;
  pending: number;
  failed: number;
};

export function searchReadingEvidence(options: SearchReadingEvidenceOptions): {
  evidence: ReadingEvidence[];
  projection: ReadingEvidenceProjectionStatus;
} {
  const projection = readReadingEvidenceProjectionStatus(options);
  const query = options.query.trim().normalize();
  if (!query) return { evidence: [], projection };

  const candidates = readKeywordReadingEvidenceCandidates(options.executor, query, options.scope);
  if (candidates.length === 0) return { evidence: [], projection };

  const evidence = materializeReadingEvidenceCandidates(
    options.executor,
    candidates,
    options.scope,
    query,
  );
  return {
    evidence: rankReadingEvidenceCandidates(evidence, resultLimit(options.limit)),
    projection,
  };
}

export function readReadingEvidenceProjectionStatus(
  options: ReadReadingEvidenceProjectionStatusOptions,
): ReadingEvidenceProjectionStatus {
  const scope = scopeArticleFilter(options.scope, 'annotation');
  const row = options.executor
    .prepare(
      `
SELECT
  count(*) AS totalCount,
  coalesce(sum(
    CASE
      WHEN receipt.projector_version = ?
        AND (
          job.target_id IS NULL
          OR (
            job.operation = 'upsert'
            AND job.article_id = receipt.article_id
            AND job.source_version = receipt.source_version
          )
        )
      THEN 1
      ELSE 0
    END
  ), 0) AS projectedCount,
  coalesce(sum(CASE WHEN receipt.target_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS receiptCount,
  coalesce(sum(
    CASE
      WHEN receipt.projector_version <> ? AND job.target_id IS NULL THEN 1
      ELSE 0
    END
  ), 0) AS staleCount,
  coalesce(sum(
    CASE
      WHEN job.target_id IS NOT NULL
        AND NOT (
          receipt.target_id IS NOT NULL
          AND receipt.projector_version = ?
          AND job.operation = 'upsert'
          AND job.article_id = receipt.article_id
          AND job.source_version = receipt.source_version
        )
      THEN 1
      ELSE 0
    END
  ), 0) AS pendingCount,
  coalesce(sum(
    CASE
      WHEN job.last_error_at IS NOT NULL
        AND NOT (
          receipt.target_id IS NOT NULL
          AND receipt.projector_version = ?
          AND job.operation = 'upsert'
          AND job.article_id = receipt.article_id
          AND job.source_version = receipt.source_version
        )
      THEN 1
      ELSE 0
    END
  ), 0) AS failedCount
FROM annotations AS annotation
LEFT JOIN reading_memory_evidence_receipts AS receipt
  ON receipt.target_type = ?
  AND receipt.target_id = annotation.id
  AND receipt.article_id = annotation.article_id
LEFT JOIN reading_memory_projection_jobs AS job
  ON job.target_type = ?
  AND job.target_id = annotation.id
  AND job.article_id = annotation.article_id
WHERE ${scope.sql}
`,
    )
    .get(
      readingMemoryEvidenceProjectorVersion,
      readingMemoryEvidenceProjectorVersion,
      readingMemoryEvidenceProjectorVersion,
      readingMemoryEvidenceProjectorVersion,
      annotationThreadTargetType,
      annotationThreadTargetType,
      ...scope.values,
    );
  const counts = projectionCounts(row);
  return {
    state: projectionState(counts),
    coverage: {
      projectedAssetCount: counts.projected,
      eligibleAssetCount: counts.total,
    },
  };
}

export function readKeywordReadingEvidenceCandidates(
  executor: ReadingMemorySqliteExecutor,
  query: string,
  scope: ReadingEvidenceScope,
): ReadingEvidenceCandidate[] {
  const normalizedQuery = query.trim().normalize();
  if (!normalizedQuery) return [];

  const filter = scopeArticleFilter(scope, 'entry');
  const rows =
    Array.from(normalizedQuery).length >= 3
      ? executor
          .prepare(
            `
SELECT
  entry.id,
  entry.article_id AS articleId,
  entry.target_id AS targetId,
  entry.source_version AS sourceVersion
FROM reading_memory_evidence_fts
INNER JOIN reading_memory_evidence_entries AS entry
  ON entry.id = reading_memory_evidence_fts.entry_id
INNER JOIN reading_memory_evidence_receipts AS receipt
  ON receipt.target_type = entry.target_type
  AND receipt.target_id = entry.target_id
  AND receipt.article_id = entry.article_id
  AND receipt.source_version = entry.source_version
LEFT JOIN reading_memory_projection_jobs AS job
  ON job.target_type = entry.target_type
  AND job.target_id = entry.target_id
WHERE reading_memory_evidence_fts MATCH ?
  AND entry.projector_version = receipt.projector_version
  AND (
    job.target_id IS NULL
    OR (job.operation = 'upsert' AND job.source_version = receipt.source_version)
  )
  AND (${filter.sql})
ORDER BY
  (receipt.projector_version = ?) DESC,
  entry.is_judgment DESC,
  entry.is_user_authored DESC,
  bm25(reading_memory_evidence_fts) ASC,
  entry.source_updated_at DESC,
  entry.article_id ASC,
  entry.id ASC
LIMIT ?
`,
          )
          .all(
            ftsPhrase(normalizedQuery),
            ...filter.values,
            readingMemoryEvidenceProjectorVersion,
            candidateLimit,
          )
      : executor
          .prepare(
            `
SELECT
  entry.id,
  entry.article_id AS articleId,
  entry.target_id AS targetId,
  entry.source_version AS sourceVersion
FROM reading_memory_evidence_entries AS entry
INNER JOIN reading_memory_evidence_receipts AS receipt
  ON receipt.target_type = entry.target_type
  AND receipt.target_id = entry.target_id
  AND receipt.article_id = entry.article_id
  AND receipt.source_version = entry.source_version
LEFT JOIN reading_memory_projection_jobs AS job
  ON job.target_type = entry.target_type
  AND job.target_id = entry.target_id
WHERE entry.search_text LIKE ? ESCAPE '\\'
  AND entry.projector_version = receipt.projector_version
  AND (
    job.target_id IS NULL
    OR (job.operation = 'upsert' AND job.source_version = receipt.source_version)
  )
  AND (${filter.sql})
ORDER BY
  (receipt.projector_version = ?) DESC,
  entry.is_judgment DESC,
  entry.is_user_authored DESC,
  entry.source_updated_at DESC,
  entry.article_id ASC,
  entry.id ASC
LIMIT ?
`,
          )
          .all(
            `%${escapeLike(normalizedQuery)}%`,
            ...filter.values,
            readingMemoryEvidenceProjectorVersion,
            candidateLimit,
          );
  return rows.flatMap((row) => {
    const candidate = evidenceCandidate(row);
    return candidate ? [candidate] : [];
  });
}

export function materializeReadingEvidenceCandidates(
  executor: ReadingMemorySqliteExecutor,
  candidates: readonly ReadingEvidenceCandidate[],
  scope: ReadingEvidenceScope,
  query?: string,
): ReadingEvidence[] {
  const sources = readStoredAnnotationThreadSources(
    executor,
    candidates.map((candidate) => candidate.targetId),
  );
  const sourcesByTargetId = new Map(sources.map((source) => [source.targetId, source]));
  const articles = readArticleMetadata(
    executor,
    candidates.map((candidate) => candidate.articleId),
  );
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const projectedEntries = new Map<string, Map<string, ProjectedReadingEvidenceEntry>>();
  const evidence: ReadingEvidence[] = [];

  for (const candidate of candidates) {
    const source = sourcesByTargetId.get(candidate.targetId);
    const article = articlesById.get(candidate.articleId);
    if (
      !source ||
      !article ||
      source.articleId !== candidate.articleId ||
      source.sourceVersion !== candidate.sourceVersion
    ) {
      continue;
    }

    let entriesById = projectedEntries.get(candidate.targetId);
    if (!entriesById) {
      const entries = projectReadingEvidenceThread({
        articleId: source.articleId,
        annotation: source.annotation,
        sourceVersion: source.sourceVersion,
        projectorVersion: readingMemoryEvidenceProjectorVersion,
        reviews: source.reviews,
      });
      entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      projectedEntries.set(candidate.targetId, entriesById);
    }
    const projected = entriesById.get(candidate.id);
    if (!projected || (query !== undefined && !matchesSearchText(projected.searchText, query))) {
      continue;
    }

    const item = materializeReadingEvidence({
      projected,
      annotation: source.annotation,
      article,
      reviews: source.reviews,
    });
    if (item) evidence.push(item);
  }
  const allowedArticleIds = readAllowedArticleIds(
    executor,
    scope,
    evidence.map((item) => item.source.ref.id),
  );
  return evidence.filter((item) => allowedArticleIds.has(item.source.ref.id));
}

function readArticleMetadata(executor: ReadingMemorySqliteExecutor, articleIds: string[]) {
  const ids = uniqueNonEmptyStrings(articleIds);
  if (ids.length === 0) return [];
  return executor
    .prepare(
      `
SELECT id, source_type AS sourceType, title, byline
FROM articles
WHERE id IN (SELECT value FROM json_each(?))
ORDER BY id ASC
`,
    )
    .all(JSON.stringify(ids))
    .flatMap((row) => {
      const id = stringField(recordField(row, 'id'));
      const title = stringField(recordField(row, 'title'));
      if (!id) return [];
      const byline = stringField(recordField(row, 'byline')) || undefined;
      return [
        {
          id,
          sourceType: normalizeArticleSourceType(recordField(row, 'sourceType')),
          title,
          byline,
        } satisfies ArticleMetadata,
      ];
    });
}

function readAllowedArticleIds(
  executor: ReadingMemorySqliteExecutor,
  scope: ReadingEvidenceScope,
  articleIds: string[],
) {
  const ids = uniqueNonEmptyStrings(articleIds);
  if (ids.length === 0) return new Set<string>();
  if (scope.kind === 'library') return new Set(ids);
  if (scope.kind === 'sources') {
    const selected = new Set(articleSourceIds(scope));
    return new Set(ids.filter((id) => selected.has(id)));
  }

  const rows = executor
    .prepare(
      `
SELECT member_id AS articleId
FROM collection_members
WHERE collection_id = ?
  AND member_kind = 'article'
  AND member_id IN (SELECT value FROM json_each(?))
ORDER BY member_id ASC
`,
    )
    .all(scope.collectionId, JSON.stringify(ids));
  return new Set(rows.map((row) => stringField(recordField(row, 'articleId'))).filter(Boolean));
}

export function scopeArticleFilter(
  scope: ReadingEvidenceScope,
  source: 'annotation' | 'entry',
): SqlFilter {
  const articleColumn = source === 'annotation' ? 'annotation.article_id' : 'entry.article_id';
  if (scope.kind === 'library') return { sql: '1', values: [] };
  if (scope.kind === 'collection') {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM collection_members AS member
        WHERE member.collection_id = ?
          AND member.member_kind = 'article'
          AND member.member_id = ${articleColumn}
      )`,
      values: [scope.collectionId],
    };
  }

  const articleIds = articleSourceIds(scope);
  if (articleIds.length === 0) return { sql: '0', values: [] };
  return {
    sql: `${articleColumn} IN (SELECT value FROM json_each(?))`,
    values: [JSON.stringify(articleIds)],
  };
}

function articleSourceIds(scope: Extract<ReadingEvidenceScope, { kind: 'sources' }>) {
  return uniqueNonEmptyStrings(
    scope.sources.flatMap((source) => (source.kind === 'article' ? [source.id] : [])),
  );
}

function evidenceCandidate(row: unknown): ReadingEvidenceCandidate | null {
  const id = stringField(recordField(row, 'id'));
  const articleId = stringField(recordField(row, 'articleId'));
  const targetId = stringField(recordField(row, 'targetId'));
  const sourceVersion = stringField(recordField(row, 'sourceVersion'));
  if (!id || !articleId || !targetId || !sourceVersion) return null;
  return { id, articleId, targetId, sourceVersion };
}

function projectionCounts(row: unknown): ProjectionCounts {
  return {
    total: countField(row, 'totalCount'),
    projected: countField(row, 'projectedCount'),
    receipt: countField(row, 'receiptCount'),
    stale: countField(row, 'staleCount'),
    pending: countField(row, 'pendingCount'),
    failed: countField(row, 'failedCount'),
  };
}

function projectionState(counts: ProjectionCounts): ReadingEvidenceProjectionState {
  if (counts.total === 0) return 'available';
  if (counts.failed > 0) return 'failed';
  if (counts.pending > 0) return 'building';
  if (counts.projected === counts.total) return 'available';
  if (counts.stale > 0) return 'stale';
  if (counts.receipt === 0) return 'not_built';
  return 'building';
}

function countField(row: unknown, field: string) {
  return Math.max(0, Math.floor(finiteNumberFieldOrZero(recordField(row, field))));
}

function resultLimit(limit: number | undefined) {
  if (!Number.isSafeInteger(limit) || !limit || limit < 1) return defaultResultLimit;
  return Math.min(limit, maximumResultLimit);
}

function ftsPhrase(query: string) {
  return `"${query.replaceAll('"', '""')}"`;
}

function escapeLike(query: string) {
  return query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function matchesSearchText(searchText: string, query: string) {
  return searchText
    .normalize()
    .toLocaleLowerCase()
    .includes(query.trim().normalize().toLocaleLowerCase());
}
