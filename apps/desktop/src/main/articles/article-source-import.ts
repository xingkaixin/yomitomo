import type { ArticleImportResult } from '../../ipc-contract';
import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import type { ArticleIdentity } from './article-repository-columns';

export type ArticleSourceImportRepository = {
  findArticleByIdentity: (identity: ArticleIdentity) => ArticleIdentity | null;
  readArticle: (id: string) => Promise<ArticleRecord | null>;
  saveArticle: (article: ArticleRecord) => Promise<ArticleUpsertPatch>;
};

export type ArticleSourceImportLifecycleInput = {
  record: ArticleRecord;
  repository: ArticleSourceImportRepository;
  isDuplicate?: (existingArticle: ArticleRecord | null) => boolean;
  mergeExistingArticle?: (record: ArticleRecord, existingArticle: ArticleRecord) => ArticleRecord;
  saveSourceFile?: (articleId: string) => Promise<void>;
  saveThumbnail?: (articleId: string) => Promise<void>;
  cleanupSourceFile?: (articleId: string) => Promise<void>;
  cleanupThumbnail?: (articleId: string) => Promise<void>;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export async function importArticleSource(
  input: ArticleSourceImportLifecycleInput,
): Promise<ArticleImportResult> {
  const existingIdentity = input.repository.findArticleByIdentity(input.record);
  const existingArticle = existingIdentity
    ? await input.repository.readArticle(existingIdentity.id)
    : null;

  if (existingIdentity && shouldReturnDuplicate(input, existingArticle)) {
    await persistSourceAssets(input, existingIdentity.id);
    return {
      status: 'duplicate',
      article: existingArticle || input.record,
    };
  }

  const article =
    existingArticle && input.mergeExistingArticle
      ? input.mergeExistingArticle(input.record, existingArticle)
      : input.record;
  const cleanupSourceAssets = await persistSourceAssets(input, article.id);
  let patch: ArticleUpsertPatch;
  try {
    patch = await input.repository.saveArticle(article);
  } catch (error) {
    await cleanupSourceAssets();
    throw error;
  }
  return { status: 'imported', article, patch };
}

export async function canceledArticleSourceImport<T>(
  promise: Promise<T>,
  isCanceledError: (error: unknown) => boolean,
): Promise<T | null> {
  return promise.catch((error: unknown) => {
    if (isCanceledError(error)) return null;
    throw error;
  });
}

function shouldReturnDuplicate(
  input: ArticleSourceImportLifecycleInput,
  existingArticle: ArticleRecord | null,
) {
  return input.isDuplicate ? input.isDuplicate(existingArticle) : true;
}

async function persistSourceAssets(input: ArticleSourceImportLifecycleInput, articleId: string) {
  let sourceFileSaved = false;
  let thumbnailSaved = false;

  try {
    await input.saveSourceFile?.(articleId);
    sourceFileSaved = Boolean(input.saveSourceFile);
    await input.saveThumbnail?.(articleId);
    thumbnailSaved = Boolean(input.saveThumbnail);
  } catch (error) {
    await cleanupPersistedSourceAssets(input, articleId, {
      sourceFileSaved,
      thumbnailSaved,
    });
    throw error;
  }

  return () =>
    cleanupPersistedSourceAssets(input, articleId, {
      sourceFileSaved,
      thumbnailSaved,
    });
}

async function cleanupPersistedSourceAssets(
  input: ArticleSourceImportLifecycleInput,
  articleId: string,
  saved: { sourceFileSaved: boolean; thumbnailSaved: boolean },
) {
  try {
    if (saved.thumbnailSaved) await input.cleanupThumbnail?.(articleId);
    if (saved.sourceFileSaved) await input.cleanupSourceFile?.(articleId);
  } catch (error) {
    input.logError?.('article_source_import.cleanup_failed', error, {
      articleId,
      sourceFileSaved: saved.sourceFileSaved,
      thumbnailSaved: saved.thumbnailSaved,
    });
  }
}
