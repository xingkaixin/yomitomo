import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  canceledArticleSourceImport,
  importArticleSource,
  type ArticleSourceImportRepository,
} from './article-source-import';
import type { ArticleIdentity } from './article-repository-columns';
import type { StagedSourceAssets } from './source-asset-staging';

describe('article source import lifecycle', () => {
  it('imports a new article and returns the saved patch', async () => {
    const record = articleRecord('article-new');
    const patch = articlePatch(record.id);
    const repository = repositoryStub({ patch });
    const assets = stagedAssets();
    const stageSourceAssets = vi.fn(async () => assets);

    await expect(importArticleSource({ record, repository, stageSourceAssets })).resolves.toEqual({
      status: 'imported',
      article: record,
      patch,
    });

    expect(stageSourceAssets).toHaveBeenCalledWith(record.id);
    expect(assets.commit).toHaveBeenCalled();
    expect(assets.finalize).toHaveBeenCalled();
    expect(repository.saveArticle).toHaveBeenCalledWith(record);
  });

  it('returns duplicate and refreshes the existing source file without saving article rows', async () => {
    const record = articleRecord('article-next');
    const existing = articleRecord('article-existing');
    const repository = repositoryStub({ existingIdentity: existing, existingArticle: existing });
    const assets = stagedAssets();
    const stageSourceAssets = vi.fn(async () => assets);

    await expect(importArticleSource({ record, repository, stageSourceAssets })).resolves.toEqual({
      status: 'duplicate',
      article: existing,
    });

    expect(stageSourceAssets).toHaveBeenCalledWith(existing.id);
    expect(repository.saveArticle).not.toHaveBeenCalled();
  });

  it('saves PDF thumbnail alongside the source file for duplicate imports', async () => {
    const record = articleRecord('pdf-next');
    const existing = articleRecord('pdf-existing');
    const repository = repositoryStub({ existingIdentity: existing, existingArticle: existing });
    const assets = stagedAssets();
    const stageSourceAssets = vi.fn(async () => assets);

    await importArticleSource({ record, repository, stageSourceAssets });

    expect(stageSourceAssets).toHaveBeenCalledWith(existing.id);
    expect(assets.commit).toHaveBeenCalled();
    expect(assets.finalize).toHaveBeenCalled();
  });

  it('preserves the existing source asset when duplicate commit fails', async () => {
    const record = articleRecord('pdf-next');
    const existing = articleRecord('pdf-existing');
    const repository = repositoryStub({ existingIdentity: existing, existingArticle: existing });
    const commitError = new Error('injected asset rename failure');
    const logError = vi.fn();
    const assets = stagedAssets({
      commit: vi.fn(async () => {
        throw commitError;
      }),
    });

    await expect(
      importArticleSource({
        record,
        repository,
        stageSourceAssets: async () => assets,
        logError,
      }),
    ).rejects.toBe(commitError);

    expect(assets.abort).toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith('article_source_import.persist_failed', commitError, {
      articleId: existing.id,
      operationId: expect.any(String),
      phase: 'commit',
    });
  });

  it('cleans persisted source assets when saving a new article fails', async () => {
    const record = articleRecord('pdf-new', { sourceType: 'pdf' });
    const error = new Error('save failed');
    const repository = repositoryStub({ saveError: error });
    const assets = stagedAssets();

    await expect(
      importArticleSource({
        record,
        repository,
        stageSourceAssets: async () => assets,
      }),
    ).rejects.toBe(error);

    expect(assets.abort).toHaveBeenCalled();
  });

  it('logs cleanup failures without hiding the original save failure', async () => {
    const record = articleRecord('pdf-cleanup-fails', { sourceType: 'pdf' });
    const saveError = new Error('save failed');
    const cleanupError = new Error('cleanup failed');
    const repository = repositoryStub({ saveError });
    const logError = vi.fn();
    const assets = stagedAssets({
      abort: vi.fn(async () => {
        throw cleanupError;
      }),
    });

    await expect(
      importArticleSource({
        record,
        repository,
        stageSourceAssets: async () => assets,
        logError,
      }),
    ).rejects.toBe(saveError);

    expect(logError).toHaveBeenCalledWith('article_source_import.cleanup_failed', cleanupError, {
      articleId: record.id,
      operationId: expect.any(String),
      phase: 'rollback',
    });
  });

  it('does not report a committed import as failed when backup cleanup fails', async () => {
    const record = articleRecord('pdf-finalize-fails', { sourceType: 'pdf' });
    const cleanupError = new Error('backup cleanup failed');
    const repository = repositoryStub({});
    const logError = vi.fn();
    const assets = stagedAssets({
      finalize: vi.fn(async () => {
        throw cleanupError;
      }),
    });

    await expect(
      importArticleSource({
        record,
        repository,
        stageSourceAssets: async () => assets,
        logError,
      }),
    ).resolves.toEqual({
      status: 'imported',
      article: record,
      patch: articlePatch(record.id),
    });

    expect(logError).toHaveBeenCalledWith('article_source_import.cleanup_failed', cleanupError, {
      articleId: record.id,
      operationId: expect.any(String),
      phase: 'finalize',
    });
  });

  it('replaces a challenge article while preserving createdAt', async () => {
    const record = articleRecord('article-next', {
      createdAt: '2026-06-04T02:00:00.000Z',
      title: 'Readable article',
    });
    const existing = articleRecord('article-next', {
      createdAt: '2026-06-01T00:00:00.000Z',
      title: 'Just a moment',
    });
    const patch = articlePatch(record.id);
    const repository = repositoryStub({
      existingIdentity: existing,
      existingArticle: existing,
      patch,
    });

    await expect(
      importArticleSource({
        record,
        repository,
        isDuplicate: (article) => Boolean(article && article.title !== 'Just a moment'),
        mergeExistingArticle: (next, previous) => ({
          ...next,
          createdAt: previous.createdAt,
        }),
      }),
    ).resolves.toEqual({
      status: 'imported',
      article: {
        ...record,
        createdAt: existing.createdAt,
      },
      patch,
    });
  });

  it('maps canceled adapter errors to a null record', async () => {
    const error = new Error('canceled');

    await expect(
      canceledArticleSourceImport(Promise.reject(error), (input) => input === error),
    ).resolves.toBeNull();
  });
});

function repositoryStub(input: {
  existingIdentity?: ArticleIdentity;
  existingArticle?: ArticleRecord | null;
  patch?: ArticleUpsertPatch;
  saveError?: Error;
}): ArticleSourceImportRepository {
  return {
    findArticleByIdentity: vi.fn(() => input.existingIdentity || null),
    readArticle: vi.fn(async () => input.existingArticle || null),
    saveArticle: vi.fn(async (article) => {
      if (input.saveError) throw input.saveError;
      return input.patch || articlePatch(article.id);
    }),
  };
}

function stagedAssets(overrides: Partial<StagedSourceAssets> = {}): StagedSourceAssets {
  return {
    abort: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    finalize: vi.fn(async () => undefined),
    ...overrides,
  };
}

function articlePatch(articleId: string): ArticleUpsertPatch {
  return {
    type: 'article-upsert',
    article: {
      id: articleId,
      url: `https://example.com/${articleId}`,
      canonicalUrl: `https://example.com/${articleId}`,
      sourceType: 'web',
      title: articleId,
      contentHash: `hash-${articleId}`,
      annotations: [],
      annotationCount: 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      distillationCount: 0,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    },
  };
}

function articleRecord(id: string, overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    contentHtml: '<p>正文</p>',
    contentHash: `hash-${id}`,
    annotations: [],
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}
