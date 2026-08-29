import { isRecord, stringField } from '@yomitomo/shared';
import {
  queueReadingMemoryProjectionJob,
  type ReadingMemoryProjectionJob,
} from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import {
  annotationThreadSourceVersion,
  deletedAnnotationThreadSourceVersion,
} from './reading-memory-source-version';

const annotationSourceColumns = `
  id,
  article_id,
  anchor,
  author,
  annotation_type,
  reading_intent,
  move_type,
  why_here,
  evidence_used,
  confidence,
  should_show,
  color,
  agent_id,
  agent_username,
  agent_nickname,
  agent_avatar,
  agent_annotation_color,
  user_id,
  user_username,
  user_nickname,
  user_avatar,
  user_annotation_color,
  distillation_status,
  distillation_content,
  distillation_published_at,
  distillation_updated_at,
  distillation_review_sessions,
  created_at,
  updated_at
`;

const commentSourceColumns = `
  id,
  annotation_id,
  author,
  content,
  created_at,
  reply_to,
  agent_id,
  agent_username,
  agent_nickname,
  agent_avatar,
  agent_annotation_color,
  reading_intent,
  review_label,
  assistant_progress,
  user_id,
  user_username,
  user_nickname,
  user_avatar,
  user_annotation_color,
  pending
`;

type QueueAnnotationThreadProjectionInput = {
  articleId: string;
  annotationId: string;
  queuedAt: string;
};

export function queueStoredAnnotationThreadProjection(
  executor: ReadingMemorySqliteExecutor,
  input: QueueAnnotationThreadProjectionInput,
) {
  const annotation = persistedSourceRow(
    executor
      .prepare(
        `
SELECT ${annotationSourceColumns}
FROM annotations
WHERE article_id = ? AND id = ?
`,
      )
      .get(input.articleId, input.annotationId),
  );
  if (!annotation) throw new Error('READING_MEMORY_PROJECTION_SOURCE_NOT_FOUND');

  const comments = persistedSourceRows(
    executor
      .prepare(
        `
SELECT ${commentSourceColumns}
FROM comments
WHERE annotation_id = ?
ORDER BY id ASC
`,
      )
      .all(input.annotationId),
  );
  queueStoredAnnotationThreads(executor, [annotation], comments, input.queuedAt);
}

export function queueStoredArticleAnnotationThreadProjections(
  executor: ReadingMemorySqliteExecutor,
  input: Pick<QueueAnnotationThreadProjectionInput, 'articleId' | 'queuedAt'>,
) {
  const annotations = persistedSourceRows(
    executor
      .prepare(
        `
SELECT ${annotationSourceColumns}
FROM annotations
WHERE article_id = ?
ORDER BY id ASC
`,
      )
      .all(input.articleId),
  );
  if (annotations.length === 0) return;

  const comments = persistedSourceRows(
    executor
      .prepare(
        `
SELECT ${commentSourceColumns}
FROM comments
WHERE annotation_id IN (
  SELECT id
  FROM annotations
  WHERE article_id = ?
)
ORDER BY annotation_id ASC, id ASC
`,
      )
      .all(input.articleId),
  );
  queueStoredAnnotationThreads(executor, annotations, comments, input.queuedAt);
}

export function queueDeletedAnnotationThreadProjection(
  executor: ReadingMemorySqliteExecutor,
  input: QueueAnnotationThreadProjectionInput,
) {
  queueReadingMemoryProjectionJob(executor, {
    targetType: 'annotation_thread',
    targetId: input.annotationId,
    articleId: input.articleId,
    sourceVersion: deletedAnnotationThreadSourceVersion(input.annotationId),
    operation: 'delete',
    queuedAt: input.queuedAt,
  });
}

function queueStoredAnnotationThreads(
  executor: ReadingMemorySqliteExecutor,
  annotations: PersistedSourceRow[],
  comments: PersistedSourceRow[],
  queuedAt: string,
) {
  const commentsByAnnotation = new Map<string, PersistedSourceRow[]>();
  for (const comment of comments) {
    const annotationId = stringField(comment.annotation_id);
    if (!annotationId) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    const threadComments = commentsByAnnotation.get(annotationId) || [];
    threadComments.push(comment);
    commentsByAnnotation.set(annotationId, threadComments);
  }

  for (const annotation of annotations) {
    const articleId = stringField(annotation.article_id);
    if (!articleId) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    const job: ReadingMemoryProjectionJob = {
      targetType: 'annotation_thread',
      targetId: annotation.id,
      articleId,
      sourceVersion: annotationThreadSourceVersion(
        annotation,
        commentsByAnnotation.get(annotation.id) || [],
      ),
      operation: 'upsert',
      queuedAt,
    };
    queueReadingMemoryProjectionJob(executor, job);
  }
}

type PersistedSourceRow = Record<string, unknown> & { id: string };

function persistedSourceRows(rows: unknown[]): PersistedSourceRow[] {
  return rows.map((row) => {
    const source = persistedSourceRow(row);
    if (!source) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    return source;
  });
}

function persistedSourceRow(row: unknown): PersistedSourceRow | null {
  if (!isRecord(row)) return null;
  const id = stringField(row.id);
  return id ? { ...row, id } : null;
}
