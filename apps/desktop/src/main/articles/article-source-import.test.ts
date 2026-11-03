import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import { describe, expect, it, vi } from 'vitest';
import { importArticleSource, type ArticleSourceImportRepository } from './article-source-import';
import type { ArticleIdentity } from './article-repository-columns';
import type { StagedSourceAssets } from './source-asset-staging';

describe('article source import lifecycle', () => {
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
});

function repositoryStub(input: {
  existingIdentity?: ArticleIdentity;
  existingArticle?: ArticleRecord | null;
}): ArticleSourceImportRepository {
  return {
    findArticleByIdentity: vi.fn(() => input.existingIdentity || null),
    readArticle: vi.fn(async () => input.existingArticle || null),
    saveArticle: vi.fn(async (article) => articlePatch(article.id)),
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
      counts: {
        annotationCount: 0,
        thoughtCount: 0,
        discussionCommentCount: 0,
        aiCommentCount: 0,
        distillationCount: 0,
      },
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    },
  };
}

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function articleRecord(id: string, overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    sourceType: 'web',
    title: id,
    contentHtml: '<p>正文</p>',
    contentHash: `hash-${id}`,
    annotations: [],
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}
