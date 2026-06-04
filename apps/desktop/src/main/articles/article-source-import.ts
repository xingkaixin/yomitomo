import type { ArticleImportResult } from '../../ipc-contract';
import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import type { ArticleIdentity } from './article-repository';

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
  await persistSourceAssets(input, article.id);
  const patch = await input.repository.saveArticle(article);
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
  await input.saveSourceFile?.(articleId);
  await input.saveThumbnail?.(articleId);
}
