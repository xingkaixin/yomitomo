import type { Annotation, AnnotationAuthorRef, Comment } from '@yomitomo/shared';
import {
  isRecord,
  normalizeAgentReadingIntent,
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeAnnotationType,
  normalizeReviewOpinionLabel,
  stringField,
  uniqueNonEmptyStrings,
} from '@yomitomo/shared';
import { normalizeTextAnchor } from '../store/store-normalizers-annotations';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import { annotationThreadSourceVersion } from './reading-memory-source-version';

const annotationSourceColumns = [
  'id',
  'article_id',
  'anchor',
  'author',
  'annotation_type',
  'reading_intent',
  'move_type',
  'why_here',
  'evidence_used',
  'confidence',
  'should_show',
  'color',
  'agent_id',
  'agent_username',
  'agent_nickname',
  'agent_avatar',
  'agent_annotation_color',
  'user_id',
  'user_username',
  'user_nickname',
  'user_avatar',
  'user_annotation_color',
  'distillation_status',
  'distillation_content',
  'distillation_published_at',
  'distillation_updated_at',
  'distillation_review_sessions',
  'created_at',
  'updated_at',
] as const;

const commentSourceColumns = [
  'id',
  'annotation_id',
  'author',
  'content',
  'created_at',
  'reply_to',
  'agent_id',
  'agent_username',
  'agent_nickname',
  'agent_avatar',
  'agent_annotation_color',
  'reading_intent',
  'review_label',
  'assistant_progress',
  'user_id',
  'user_username',
  'user_nickname',
  'user_avatar',
  'user_annotation_color',
  'pending',
] as const;

const sourceReadChunkSize = 200;

type PersistedSourceRow = Record<string, unknown> & { id: string };

export type ReadingMemoryEvidenceSource = {
  targetId: string;
  articleId: string;
  sourceVersion: string;
  annotation: Annotation;
};

export function readStoredAnnotationThreadSources(
  executor: ReadingMemorySqliteExecutor,
  annotationIds: readonly string[],
) {
  const ids = uniqueNonEmptyStrings(annotationIds);
  if (ids.length === 0) return [];

  const annotations = chunks(ids, sourceReadChunkSize).flatMap((chunk) =>
    persistedSourceRows(
      executor
        .prepare(
          `
SELECT ${selectedColumns('annotation', annotationSourceColumns)}
FROM annotations AS annotation
WHERE annotation.id IN (${questionMarks(chunk.length)})
ORDER BY annotation.article_id ASC, annotation.id ASC
`,
        )
        .all(...chunk),
    ),
  );
  return evidenceSources(executor, annotations);
}

export function readStoredArticleAnnotationThreadSources(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
) {
  const annotations = persistedSourceRows(
    executor
      .prepare(
        `
SELECT ${selectedColumns('annotation', annotationSourceColumns)}
FROM annotations AS annotation
WHERE annotation.article_id = ?
ORDER BY annotation.id ASC
`,
      )
      .all(articleId),
  );
  return evidenceSources(executor, annotations);
}

function evidenceSources(executor: ReadingMemorySqliteExecutor, annotations: PersistedSourceRow[]) {
  if (annotations.length === 0) return [];
  const comments = readSourceComments(
    executor,
    annotations.map((annotation) => annotation.id),
  );
  const commentsByAnnotation = new Map<string, PersistedSourceRow[]>();
  for (const comment of comments) {
    const annotationId = stringField(comment.annotation_id);
    if (!annotationId) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    const threadComments = commentsByAnnotation.get(annotationId) || [];
    threadComments.push(comment);
    commentsByAnnotation.set(annotationId, threadComments);
  }

  return annotations.map((annotation): ReadingMemoryEvidenceSource => {
    const articleId = stringField(annotation.article_id);
    if (!articleId) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    const sourceComments = commentsByAnnotation.get(annotation.id) || [];
    return {
      targetId: annotation.id,
      articleId,
      sourceVersion: annotationThreadSourceVersion(annotation, sourceComments),
      annotation: annotationFromSource(annotation, sourceComments),
    };
  });
}

function readSourceComments(
  executor: ReadingMemorySqliteExecutor,
  annotationIds: readonly string[],
) {
  return chunks(annotationIds, sourceReadChunkSize).flatMap((chunk) =>
    persistedSourceRows(
      executor
        .prepare(
          `
SELECT ${selectedColumns('comment', commentSourceColumns)}
FROM comments AS comment
WHERE comment.annotation_id IN (${questionMarks(chunk.length)})
ORDER BY comment.annotation_id ASC, comment.created_at ASC, comment.id ASC
`,
        )
        .all(...chunk),
    ),
  );
}

function annotationFromSource(
  annotation: PersistedSourceRow,
  comments: PersistedSourceRow[],
): Annotation {
  const annotationType = normalizeAnnotationType(annotation.annotation_type) || undefined;
  const readingIntent = normalizeAgentReadingIntent(annotation.reading_intent) || undefined;
  const moveType = normalizeAnnotationMove(annotation.move_type) || undefined;
  const evidenceUsed = jsonArray(annotation.evidence_used)
    .map(normalizeAnnotationEvidenceSource)
    .filter((value) => value !== null);
  const confidence = normalizeAnnotationConfidence(annotation.confidence) || undefined;
  const distillationStatus =
    annotation.distillation_status === 'published' ||
    annotation.distillation_status === 'unpublished'
      ? annotation.distillation_status
      : null;
  const distillationContent = stringField(annotation.distillation_content);
  return {
    id: annotation.id,
    anchor: normalizeTextAnchor(jsonValue(annotation.anchor)),
    author: annotationAuthor(annotation),
    annotationType,
    readingIntent,
    moveType,
    whyHere: stringField(annotation.why_here) || undefined,
    evidenceUsed: evidenceUsed.length > 0 ? evidenceUsed : undefined,
    confidence,
    shouldShow: optionalBoolean(annotation.should_show),
    color: stringField(annotation.color),
    comments: comments.map(commentFromSource),
    distillation:
      distillationStatus || distillationContent
        ? {
            status: distillationStatus || 'unpublished',
            content: distillationContent,
            publishedAt: stringField(annotation.distillation_published_at) || undefined,
            updatedAt: stringField(annotation.distillation_updated_at) || undefined,
          }
        : undefined,
    createdAt: stringField(annotation.created_at),
    updatedAt: stringField(annotation.updated_at),
  };
}

function commentFromSource(comment: PersistedSourceRow): Comment {
  return {
    id: comment.id,
    author: annotationAuthor(comment),
    content: stringField(comment.content),
    createdAt: stringField(comment.created_at),
    replyTo: stringField(comment.reply_to) || undefined,
    readingIntent: normalizeAgentReadingIntent(comment.reading_intent) || undefined,
    reviewLabel: normalizeReviewOpinionLabel(comment.review_label) || undefined,
    pending: optionalBoolean(comment.pending) || undefined,
  };
}

function annotationAuthor(source: PersistedSourceRow): AnnotationAuthorRef {
  if (source.author === 'ai') {
    return {
      kind: 'agent',
      agentId: stringField(source.agent_id) || `legacy-agent:${source.id}`,
      username: stringField(source.agent_username) || 'assistant',
      nickname: stringField(source.agent_nickname) || undefined,
      avatar: stringField(source.agent_avatar) || undefined,
      annotationColor: stringField(source.agent_annotation_color) || undefined,
    };
  }
  return {
    kind: 'user',
    userId: stringField(source.user_id) || undefined,
    username: stringField(source.user_username) || 'reader',
    nickname: stringField(source.user_nickname) || undefined,
    avatar: stringField(source.user_avatar) || undefined,
    annotationColor: stringField(source.user_annotation_color) || undefined,
  };
}

function persistedSourceRows(rows: unknown[]): PersistedSourceRow[] {
  return rows.map((row) => {
    if (!isRecord(row)) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    const id = stringField(row.id);
    if (!id) throw new Error('READING_MEMORY_PROJECTION_SOURCE_INVALID');
    return { ...row, id };
  });
}

function selectedColumns(alias: string, columns: readonly string[]) {
  return columns.map((column) => `${alias}.${column}`).join(', ');
}

function jsonArray(value: unknown): unknown[] {
  const parsed = jsonValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function optionalBoolean(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return value === true || value === 1;
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function questionMarks(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}
