import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  ArticleTranslation,
  ArticleTranslationSegment,
  ArticleTranslationStatus,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreExecutor } from '../store/store-db';
import type { ArticleTranslationIdentity } from './article-translation-identity';

type ArticleTranslationRow = typeof schema.articleTranslations.$inferSelect;
type ArticleTranslationSegmentRow = typeof schema.articleTranslationSegments.$inferSelect;

export type ArticleTranslationKey = ArticleTranslationIdentity;

export type ArticleTranslationSegmentInitializer = {
  sourceBlockId: string;
  sourceText: string;
  sourceTextHash: string;
  order: number;
  retranslate: boolean;
};

export type ArticleTranslationInitializeInput = ArticleTranslationIdentity & {
  providerId?: string;
  providerName?: string;
  modelName?: string;
  segments: ArticleTranslationSegmentInitializer[];
  updatedAt: string;
};

export type ArticleTranslationSegmentUpdateInput = {
  translationId: string;
  sourceBlockId: string;
  status: Extract<ArticleTranslationStatus, 'ready' | 'failed'>;
  translatedText?: string;
  error?: string;
  updatedAt: string;
};

// SQLite binds one parameter per column; chunking keeps a large chapter well under
// the statement variable limit while still writing segments in batches.
const SEGMENT_WRITE_CHUNK_SIZE = 200;

export function readCurrentArticleTranslationRows(
  database: StoreExecutor,
  input: ArticleTranslationIdentity,
): ArticleTranslation | null {
  const row = database
    .select()
    .from(schema.articleTranslations)
    .where(
      and(
        eq(schema.articleTranslations.articleId, input.articleId),
        eq(schema.articleTranslations.sourceId, input.sourceId),
        eq(schema.articleTranslations.sourceContentHash, input.sourceContentHash),
        eq(schema.articleTranslations.targetLanguage, input.targetLanguage),
        eq(schema.articleTranslations.promptVersion, input.promptVersion),
      ),
    )
    .get();
  return row ? rowToArticleTranslation(database, row) : null;
}

export function readArticleTranslationRows(
  database: StoreExecutor,
  translationId: string,
): ArticleTranslation | null {
  const row = database
    .select()
    .from(schema.articleTranslations)
    .where(eq(schema.articleTranslations.id, translationId))
    .get();
  return row ? rowToArticleTranslation(database, row) : null;
}

export function deleteArticleTranslationRows(database: StoreExecutor, translationId: string) {
  database
    .delete(schema.articleTranslationSegments)
    .where(eq(schema.articleTranslationSegments.translationId, translationId))
    .run();
  database
    .delete(schema.articleTranslations)
    .where(eq(schema.articleTranslations.id, translationId))
    .run();
}

/**
 * Claims the session owner row for the logical translation key and writes the initial
 * segment rows. The unique index is the conflict target, so two first-time requests
 * converge on one owner instead of colliding on independently generated ids.
 */
export function initializeArticleTranslationRows(
  database: StoreDatabase,
  input: ArticleTranslationInitializeInput,
): ArticleTranslation {
  return database.transaction((tx) => {
    const translationId = claimArticleTranslationRow(tx, input);
    writeInitialSegmentRows(tx, translationId, input);
    const translation = readArticleTranslationRows(tx, translationId);
    if (!translation) throw new Error('ARTICLE_TRANSLATION_WRITE_FAILED');
    return translation;
  });
}

export function updateArticleTranslationSegmentRows(
  database: StoreDatabase,
  input: ArticleTranslationSegmentUpdateInput,
): ArticleTranslationSegment | null {
  return database.transaction((tx) => {
    const row = tx
      .update(schema.articleTranslationSegments)
      .set({
        status: input.status,
        translatedText: input.translatedText || null,
        error: input.error || null,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(schema.articleTranslationSegments.translationId, input.translationId),
          eq(schema.articleTranslationSegments.sourceBlockId, input.sourceBlockId),
        ),
      )
      .returning()
      .get();
    if (!row) return null;

    tx.update(schema.articleTranslations)
      .set({ status: 'translating', error: null, updatedAt: input.updatedAt })
      .where(eq(schema.articleTranslations.id, input.translationId))
      .run();
    return rowToArticleTranslationSegment(row);
  });
}

export function finalizeArticleTranslationRows(
  database: StoreDatabase,
  input: { translationId: string; updatedAt: string },
): ArticleTranslation | null {
  return database.transaction((tx) => finalizeArticleTranslationOwner(tx, input));
}

export function recoverInterruptedArticleTranslationRows(
  database: StoreDatabase,
  identity: ArticleTranslationIdentity,
  updatedAt: string,
): ArticleTranslation | null {
  return database.transaction((tx) => {
    const current = readCurrentArticleTranslationRows(tx, identity);
    if (current?.status !== 'translating') return current;
    tx.update(schema.articleTranslationSegments)
      .set({ status: 'failed', error: 'TRANSLATION_INTERRUPTED', updatedAt })
      .where(
        and(
          eq(schema.articleTranslationSegments.translationId, current.id),
          eq(schema.articleTranslationSegments.status, 'translating'),
        ),
      )
      .run();
    return finalizeArticleTranslationOwner(tx, { translationId: current.id, updatedAt });
  });
}

function finalizeArticleTranslationOwner(
  database: StoreExecutor,
  input: { translationId: string; updatedAt: string },
) {
  const statuses = database
    .select({ status: schema.articleTranslationSegments.status })
    .from(schema.articleTranslationSegments)
    .where(eq(schema.articleTranslationSegments.translationId, input.translationId))
    .groupBy(schema.articleTranslationSegments.status)
    .all()
    .map((row) => row.status);

  database
    .update(schema.articleTranslations)
    .set({
      status: deriveArticleTranslationStatus(statuses),
      error: statuses.includes('failed') ? 'TRANSLATION_INCOMPLETE' : null,
      updatedAt: input.updatedAt,
    })
    .where(eq(schema.articleTranslations.id, input.translationId))
    .run();
  return readArticleTranslationRows(database, input.translationId);
}

function claimArticleTranslationRow(
  database: StoreExecutor,
  input: ArticleTranslationInitializeInput,
): string {
  const ownerState = {
    providerId: input.providerId || null,
    providerName: input.providerName || null,
    modelName: input.modelName || null,
    status: 'translating',
    error: null,
    updatedAt: input.updatedAt,
  };
  const owner = database
    .insert(schema.articleTranslations)
    .values({
      id: makeId('article_translation'),
      articleId: input.articleId,
      sourceId: input.sourceId,
      sourceContentHash: input.sourceContentHash,
      targetLanguage: input.targetLanguage,
      promptVersion: input.promptVersion,
      createdAt: input.updatedAt,
      ...ownerState,
    })
    .onConflictDoUpdate({
      target: [
        schema.articleTranslations.articleId,
        schema.articleTranslations.sourceId,
        schema.articleTranslations.sourceContentHash,
        schema.articleTranslations.targetLanguage,
        schema.articleTranslations.promptVersion,
      ],
      set: ownerState,
    })
    .returning({ id: schema.articleTranslations.id })
    .get();
  return owner.id;
}

function writeInitialSegmentRows(
  database: StoreExecutor,
  translationId: string,
  input: ArticleTranslationInitializeInput,
) {
  const conflictTarget = [
    schema.articleTranslationSegments.translationId,
    schema.articleTranslationSegments.sourceBlockId,
  ];

  for (const chunk of chunked(input.segments.filter((segment) => segment.retranslate))) {
    database
      .insert(schema.articleTranslationSegments)
      .values(chunk.map((segment) => initialSegmentRow(translationId, segment, input.updatedAt)))
      .onConflictDoUpdate({
        target: conflictTarget,
        set: {
          sourceText: sql`excluded.source_text`,
          sourceTextHash: sql`excluded.source_text_hash`,
          order: sql`excluded.order_index`,
          translatedText: null,
          status: 'translating',
          error: null,
          updatedAt: input.updatedAt,
        },
      })
      .run();
  }

  for (const chunk of chunked(input.segments.filter((segment) => !segment.retranslate))) {
    database
      .insert(schema.articleTranslationSegments)
      .values(chunk.map((segment) => initialSegmentRow(translationId, segment, input.updatedAt)))
      .onConflictDoNothing({ target: conflictTarget })
      .run();
  }
}

function initialSegmentRow(
  translationId: string,
  segment: ArticleTranslationSegmentInitializer,
  updatedAt: string,
) {
  return {
    id: makeId('translation_segment'),
    translationId,
    sourceBlockId: segment.sourceBlockId,
    sourceTextHash: segment.sourceTextHash,
    sourceText: segment.sourceText,
    translatedText: null,
    status: 'translating',
    error: null,
    order: segment.order,
    createdAt: updatedAt,
    updatedAt,
  };
}

function deriveArticleTranslationStatus(statuses: string[]): ArticleTranslationStatus {
  if (statuses.includes('translating')) return 'translating';
  if (statuses.includes('failed') && !statuses.includes('ready')) return 'failed';
  return 'ready';
}

function* chunked<T>(items: T[]) {
  for (let start = 0; start < items.length; start += SEGMENT_WRITE_CHUNK_SIZE) {
    yield items.slice(start, start + SEGMENT_WRITE_CHUNK_SIZE);
  }
}

function rowToArticleTranslation(
  database: StoreExecutor,
  row: ArticleTranslationRow,
): ArticleTranslation {
  const segments = database
    .select()
    .from(schema.articleTranslationSegments)
    .where(eq(schema.articleTranslationSegments.translationId, row.id))
    .orderBy(asc(schema.articleTranslationSegments.order))
    .all()
    .map(rowToArticleTranslationSegment);

  return {
    id: row.id,
    articleId: row.articleId,
    sourceId: row.sourceId,
    sourceContentHash: row.sourceContentHash,
    targetLanguage: row.targetLanguage,
    promptVersion: row.promptVersion,
    providerId: row.providerId || undefined,
    providerName: row.providerName || undefined,
    modelName: row.modelName || undefined,
    status: normalizeArticleTranslationStatus(row.status),
    error: row.error || undefined,
    segments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToArticleTranslationSegment(
  row: ArticleTranslationSegmentRow,
): ArticleTranslationSegment {
  return {
    id: row.id,
    translationId: row.translationId,
    sourceBlockId: row.sourceBlockId,
    sourceTextHash: row.sourceTextHash,
    sourceText: row.sourceText,
    translatedText: row.translatedText || undefined,
    status: normalizeArticleTranslationStatus(row.status),
    error: row.error || undefined,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeArticleTranslationStatus(value: string): ArticleTranslationStatus {
  return value === 'translating' || value === 'ready' || value === 'failed' ? value : 'idle';
}
