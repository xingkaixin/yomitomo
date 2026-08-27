import { randomUUID } from 'node:crypto';
import type { ArticleImportResult } from '../../ipc-contract';
import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import type { ArticleIdentity } from './article-repository-columns';
import type { StagedSourceAssets } from './source-asset-staging';
import { withArticleSourceOperation } from './article-source-operations';

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
  stageSourceAssets?: (articleId: string) => Promise<StagedSourceAssets>;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export async function importArticleSource(
  input: ArticleSourceImportLifecycleInput,
): Promise<ArticleImportResult> {
  const articleId = input.repository.findArticleByIdentity(input.record)?.id || input.record.id;
  return withArticleSourceOperation(articleId, () => persistArticleSource(input));
}

async function persistArticleSource(
  input: ArticleSourceImportLifecycleInput,
): Promise<ArticleImportResult> {
  const existingIdentity = input.repository.findArticleByIdentity(input.record);
  const existingArticle = existingIdentity
    ? await input.repository.readArticle(existingIdentity.id)
    : null;

  if (existingIdentity && shouldReturnDuplicate(input, existingArticle)) {
    const assets = await persistSourceAssets(input, existingIdentity.id);
    await finalizeSourceAssets(input, existingIdentity.id, assets);
    return {
      status: 'duplicate',
      article: existingArticle || input.record,
    };
  }

  const article =
    existingArticle && input.mergeExistingArticle
      ? input.mergeExistingArticle(input.record, existingArticle)
      : input.record;
  const assets = await persistSourceAssets(input, article.id);
  let patch: ArticleUpsertPatch;
  try {
    patch = await input.repository.saveArticle(article);
  } catch (error) {
    await abortSourceAssets(input, article.id, assets);
    throw error;
  }
  await finalizeSourceAssets(input, article.id, assets);
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
  const operationId = randomUUID();
  let assets: StagedSourceAssets | undefined;
  let phase = 'stage';

  try {
    assets = await input.stageSourceAssets?.(articleId);
    phase = 'commit';
    await assets?.commit();
  } catch (error) {
    input.logError?.('article_source_import.persist_failed', error, {
      articleId,
      operationId,
      phase,
    });
    if (assets) await abortSourceAssets(input, articleId, assets, operationId);
    throw error;
  }

  return assets || emptyStagedSourceAssets;
}

const emptyStagedSourceAssets: StagedSourceAssets = {
  abort: async () => undefined,
  commit: async () => undefined,
  finalize: async () => undefined,
};

async function abortSourceAssets(
  input: ArticleSourceImportLifecycleInput,
  articleId: string,
  assets: StagedSourceAssets,
  operationId = randomUUID(),
) {
  try {
    await assets.abort();
  } catch (error) {
    input.logError?.('article_source_import.cleanup_failed', error, {
      articleId,
      operationId,
      phase: 'rollback',
    });
  }
}

async function finalizeSourceAssets(
  input: ArticleSourceImportLifecycleInput,
  articleId: string,
  assets: StagedSourceAssets,
) {
  try {
    await assets.finalize();
  } catch (error) {
    input.logError?.('article_source_import.cleanup_failed', error, {
      articleId,
      operationId: randomUUID(),
      phase: 'finalize',
    });
  }
}
