import { and, asc, eq } from 'drizzle-orm';
import type {
  ArticleTranslation,
  ArticleTranslationSegment,
  ArticleTranslationStatus,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';

type ArticleTranslationRow = typeof schema.articleTranslations.$inferSelect;
type ArticleTranslationSegmentRow = typeof schema.articleTranslationSegments.$inferSelect;

export type ArticleTranslationWriteInput = Omit<ArticleTranslation, 'segments'> & {
  segments?: ArticleTranslationSegment[];
};

export function readCurrentArticleTranslationRows(
  database: StoreExecutor,
  input: {
    articleId: string;
    sourceContentHash: string;
    targetLanguage: string;
    promptVersion: number;
  },
): ArticleTranslation | null {
  const row = database
    .select()
    .from(schema.articleTranslations)
    .where(
      and(
        eq(schema.articleTranslations.articleId, input.articleId),
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

export function upsertArticleTranslationRows(
  database: StoreExecutor,
  input: ArticleTranslationWriteInput,
): ArticleTranslation {
  database
    .insert(schema.articleTranslations)
    .values(articleTranslationToRow(input))
    .onConflictDoUpdate({
      target: schema.articleTranslations.id,
      set: articleTranslationToRow(input),
    })
    .run();

  for (const segment of input.segments || [])
    upsertArticleTranslationSegmentRows(database, segment);
  const translation = readArticleTranslationRows(database, input.id);
  if (!translation) throw new Error('ARTICLE_TRANSLATION_WRITE_FAILED');
  return translation;
}

export function upsertArticleTranslationSegmentRows(
  database: StoreExecutor,
  segment: ArticleTranslationSegment,
) {
  database
    .insert(schema.articleTranslationSegments)
    .values(articleTranslationSegmentToRow(segment))
    .onConflictDoUpdate({
      target: schema.articleTranslationSegments.id,
      set: articleTranslationSegmentToRow(segment),
    })
    .run();
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

function articleTranslationToRow(input: ArticleTranslationWriteInput) {
  return {
    id: input.id,
    articleId: input.articleId,
    sourceContentHash: input.sourceContentHash,
    targetLanguage: input.targetLanguage,
    promptVersion: input.promptVersion,
    providerId: input.providerId || null,
    providerName: input.providerName || null,
    modelName: input.modelName || null,
    status: input.status,
    error: input.error || null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function articleTranslationSegmentToRow(input: ArticleTranslationSegment) {
  return {
    id: input.id,
    translationId: input.translationId,
    sourceBlockId: input.sourceBlockId,
    sourceTextHash: input.sourceTextHash,
    sourceText: input.sourceText,
    translatedText: input.translatedText || null,
    status: input.status,
    error: input.error || null,
    order: input.order,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function normalizeArticleTranslationStatus(value: string): ArticleTranslationStatus {
  return value === 'translating' || value === 'ready' || value === 'failed' ? value : 'idle';
}
