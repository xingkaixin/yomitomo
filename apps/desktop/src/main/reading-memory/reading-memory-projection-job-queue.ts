import {
  queueReadingMemoryProjectionJob,
  type ReadingMemoryProjectionJob,
} from './reading-memory-projection-job-store';
import {
  readStoredAnnotationThreadSources,
  readStoredArticleAnnotationThreadSources,
  type ReadingMemoryEvidenceSource,
} from './reading-memory-evidence-source';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import { deletedAnnotationThreadSourceVersion } from './reading-memory-source-version';

type QueueAnnotationThreadProjectionInput = {
  articleId: string;
  annotationId: string;
  queuedAt: string;
};

export function queueStoredAnnotationThreadProjection(
  executor: ReadingMemorySqliteExecutor,
  input: QueueAnnotationThreadProjectionInput,
) {
  const [source] = readStoredAnnotationThreadSources(executor, [input.annotationId]);
  if (!source || source.articleId !== input.articleId) {
    throw new Error('READING_MEMORY_PROJECTION_SOURCE_NOT_FOUND');
  }
  queueStoredAnnotationThreads(executor, [source], input.queuedAt);
}

export function queueStoredArticleAnnotationThreadProjections(
  executor: ReadingMemorySqliteExecutor,
  input: Pick<QueueAnnotationThreadProjectionInput, 'articleId' | 'queuedAt'>,
) {
  queueStoredAnnotationThreads(
    executor,
    readStoredArticleAnnotationThreadSources(executor, input.articleId),
    input.queuedAt,
  );
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
  sources: ReadingMemoryEvidenceSource[],
  queuedAt: string,
) {
  for (const source of sources) {
    const job: ReadingMemoryProjectionJob = {
      targetType: 'annotation_thread',
      targetId: source.targetId,
      articleId: source.articleId,
      sourceVersion: source.sourceVersion,
      operation: 'upsert',
      queuedAt,
    };
    queueReadingMemoryProjectionJob(executor, job);
  }
}
