import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  canceledArticleSourceImport,
  importArticleSource,
  type ArticleSourceImportRepository,
} from './article-source-import';
import type { ArticleIdentity } from './article-repository';

describe('article source import lifecycle', () => {
  it('imports a new article and returns the saved patch', async () => {
    const record = articleRecord('article-new');
    const patch = articlePatch(record.id);
    const repository = repositoryStub({ patch });
    const saveSourceFile = vi.fn<(articleId: string) => Promise<void>>().mockResolvedValue();

    await expect(importArticleSource({ record, repository, saveSourceFile })).resolves.toEqual({
      status: 'imported',
      article: record,
      patch,
    });

    expect(saveSourceFile).toHaveBeenCalledWith(record.id);
    expect(repository.saveArticle).toHaveBeenCalledWith(record);
  });

  it('returns duplicate and refreshes the existing source file without saving article rows', async () => {
    const record = articleRecord('article-next');
    const existing = articleRecord('article-existing');
    const repository = repositoryStub({ existingIdentity: existing, existingArticle: existing });
    const saveSourceFile = vi.fn<(articleId: string) => Promise<void>>().mockResolvedValue();

    await expect(importArticleSource({ record, repository, saveSourceFile })).resolves.toEqual({
      status: 'duplicate',
      article: existing,
    });

    expect(saveSourceFile).toHaveBeenCalledWith(existing.id);
    expect(repository.saveArticle).not.toHaveBeenCalled();
  });

  it('saves PDF thumbnail alongside the source file for duplicate imports', async () => {
    const record = articleRecord('pdf-next');
    const existing = articleRecord('pdf-existing');
    const repository = repositoryStub({ existingIdentity: existing, existingArticle: existing });
    const saveSourceFile = vi.fn<(articleId: string) => Promise<void>>().mockResolvedValue();
    const saveThumbnail = vi.fn<(articleId: string) => Promise<void>>().mockResolvedValue();

    await importArticleSource({ record, repository, saveSourceFile, saveThumbnail });

    expect(saveSourceFile).toHaveBeenCalledWith(existing.id);
    expect(saveThumbnail).toHaveBeenCalledWith(existing.id);
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
}): ArticleSourceImportRepository {
  return {
    findArticleByIdentity: vi.fn(() => input.existingIdentity || null),
    readArticle: vi.fn(async () => input.existingArticle || null),
    saveArticle: vi.fn(async (article) => input.patch || articlePatch(article.id)),
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
      commentCount: 0,
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
