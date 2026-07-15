import type {
  Annotation,
  AppSettings,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  ArticleTranslation,
  ArticleUpsertPatch,
  Comment,
} from '@yomitomo/shared';
import type { ArticleLibraryListInput, ArticleLibraryListResult } from '../../ipc-contract';
import {
  buildArticleUpsertPatch,
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
  findArticleByIdentityRows,
  readArticleCoverRows,
  readArticleLibraryListRows,
  readArticleRows,
  readArticleSiteIconRawRows,
  readArticleStatsSummaryRows,
  readArticleSummaryRows,
  saveArticleReaderChatStateRows,
  saveArticleReadingProgressRows,
  saveArticleRows,
  touchArticleRows,
  updateArticleSiteIconRows,
  upsertAnnotationRows,
  upsertCommentRows,
  type ArticleIdentity,
} from '../articles/article-repository';
import {
  deleteArticleTranslationRows,
  readCurrentArticleTranslationRows,
  upsertArticleTranslationRows,
} from '../articles/article-translation-repository';
import { getDatabase } from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import {
  backfillArticleAnnotationMemory,
  getReadingMemorySqliteExecutor,
} from './store-reading-memory-lifecycle';
import { readImportSettings as readImportSettingsRows } from './settings-repository';

export async function readArticle(id: string): Promise<ArticleRecord | null> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const article = readArticleRows(database, id);
  if (article?.sourceType === 'pdf') backfillArticleAnnotationMemory(article);
  return article;
}

export async function readArticleSummary(id: string) {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readArticleSummaryRows(database, id);
}

export async function listLibraryArticles(
  input: ArticleLibraryListInput,
): Promise<ArticleLibraryListResult> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readArticleLibraryListRows(database, input);
}

export async function readArticleStatsSummaries(): Promise<ArticleSummaryRecord[]> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readArticleStatsSummaryRows(database);
}

export async function readCurrentArticleTranslation(input: {
  articleId: string;
  sourceContentHash: string;
  targetLanguage: string;
  promptVersion: number;
}) {
  return readCurrentArticleTranslationRows(getDatabase(), input);
}

export async function saveArticleTranslation(
  translation: Omit<ArticleTranslation, 'segments'> & {
    segments?: ArticleTranslation['segments'];
  },
) {
  return upsertArticleTranslationRows(getDatabase(), translation);
}

export async function deleteCurrentArticleTranslation(input: {
  articleId: string;
  sourceContentHash: string;
  targetLanguage: string;
  promptVersion: number;
}) {
  const translation = readCurrentArticleTranslationRows(getDatabase(), input);
  if (!translation) return null;
  deleteArticleTranslationRows(getDatabase(), translation.id);
  return translation;
}

export function readImportSettings(): Pick<
  AppSettings,
  'saveArticleImages' | 'allowLocalNetworkArticleImport'
> {
  return readImportSettingsRows(getDatabase());
}

export function findArticleByIdentity(identity: ArticleIdentity): ArticleIdentity | null {
  return findArticleByIdentityRows(getDatabase(), identity);
}

export async function readArticleCover(id: string): Promise<string> {
  return readArticleCoverRows(getDatabase(), id);
}

// 返回本地化的 data URI favicon；存量文章首次访问时按需回填（一次性、非热路径），之后永久命中。
export async function ensureArticleSiteIcon(id: string): Promise<string> {
  const database = getDatabase();
  const raw = readArticleSiteIconRawRows(database, id);
  if (raw.startsWith('data:image/')) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';

  const { allowLocalNetworkArticleImport } = readImportSettingsRows(database);
  const { fetchFaviconDataUrl } = await import('../articles/article-favicon');
  const dataUrl = await fetchFaviconDataUrl(raw, { allowLocalNetworkArticleImport });
  updateArticleSiteIconRows(database, id, dataUrl);
  return dataUrl;
}

export async function saveArticle(input: ArticleRecord) {
  return saveArticleRows(input);
}

export async function saveArticleAnnotation(input: {
  articleId: string;
  annotation: Annotation;
  updatedAt?: string;
}) {
  return upsertAnnotationRows(getDatabase(), input, getReadingMemorySqliteExecutor());
}

export async function saveArticleComment(input: {
  articleId: string;
  annotationId: string;
  comment: Comment;
  updatedAt?: string;
}) {
  return upsertCommentRows(getDatabase(), input, getReadingMemorySqliteExecutor());
}

export async function saveArticleReadingProgress(
  articleId: string,
  progress: ArticleReadingProgress,
) {
  return saveArticleReadingProgressRows(getDatabase(), articleId, progress);
}

export async function saveArticleReaderChatState(
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
) {
  return saveArticleReaderChatStateRows(getDatabase(), articleId, readerChatState);
}

export async function deleteArticle(id: string) {
  return deleteArticleRowsWithMemoryLifecycle(getReadingMemorySqliteExecutor(), id);
}

export async function deleteArticleAnnotation(input: {
  articleId: string;
  annotationId: string;
  updatedAt?: string;
}): Promise<ArticleUpsertPatch | null> {
  const updatedAt = input.updatedAt || new Date().toISOString();
  deleteAnnotationRowsWithMemoryLifecycle(getReadingMemorySqliteExecutor(), {
    ...input,
    deletedAt: updatedAt,
  });
  touchArticleRows(getDatabase(), input.articleId, updatedAt);
  const article = readArticleSummaryRows(getDatabase(), input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export async function deleteArticleComment(input: {
  articleId: string;
  annotationId: string;
  commentId: string;
  updatedAt?: string;
}): Promise<ArticleUpsertPatch | null> {
  const updatedAt = input.updatedAt || new Date().toISOString();
  deleteCommentRowsWithMemoryLifecycle(getReadingMemorySqliteExecutor(), {
    ...input,
    deletedAt: updatedAt,
  });
  touchArticleRows(getDatabase(), input.articleId, updatedAt);
  const article = readArticleSummaryRows(getDatabase(), input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}
