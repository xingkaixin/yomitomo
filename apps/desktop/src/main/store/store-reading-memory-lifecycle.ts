import { eq } from 'drizzle-orm';
import type { ArticleRecord } from '@yomitomo/shared';
import { backfillStoredArticleAnnotationMemoryEntries } from '../articles/article-repository';
import { logError } from '../app/logger';
import * as schema from '../db/schema';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import {
  getDatabase,
  getSqliteExecutor,
  type StoreDatabase,
  type StoreReadProfileEntry,
} from './store-db';
import { measureStoreRead } from './store-read-profile';

let annotationMemoryBackfilled = false;
const annotationMemoryBackfillVersion = 'annotation-memory-v1';

export function resetAnnotationMemoryBackfill() {
  annotationMemoryBackfilled = false;
}

export function getReadingMemorySqliteExecutor(): ReadingMemorySqliteExecutor {
  return getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor;
}

export function backfillAnnotationMemoryOnce(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  if (annotationMemoryBackfilled) return;
  if (isAnnotationMemoryBackfillComplete(database)) {
    annotationMemoryBackfilled = true;
    return;
  }

  try {
    measureStoreRead(profile, 'backfill_annotation_memory', () =>
      backfillStoredArticleAnnotationMemoryEntries(database, getReadingMemorySqliteExecutor(), {
        includePdf: false,
      }),
    );
    markAnnotationMemoryBackfillComplete(database);
    annotationMemoryBackfilled = true;
  } catch (error) {
    annotationMemoryBackfilled = true;
    logError('reading-memory.backfill_annotation_memory_failed', error);
  }
}

export function backfillArticleAnnotationMemory(
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
) {
  try {
    backfillStoredArticleAnnotationMemoryEntries(getDatabase(), getReadingMemorySqliteExecutor(), {
      articleIds: [article.id],
      includePdf: true,
    });
  } catch (error) {
    console.warn('[reading-memory] backfill article annotation memory entries failed', {
      articleId: article.id,
      error,
    });
  }
}

function isAnnotationMemoryBackfillComplete(database: StoreDatabase) {
  const settings = database
    .select({ version: schema.appSettings.annotationMemoryBackfillVersion })
    .from(schema.appSettings)
    .limit(1)
    .get();
  return settings?.version === annotationMemoryBackfillVersion;
}

function markAnnotationMemoryBackfillComplete(database: StoreDatabase) {
  database
    .update(schema.appSettings)
    .set({
      annotationMemoryBackfillVersion,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.appSettings.id, 'default'))
    .run();
}
