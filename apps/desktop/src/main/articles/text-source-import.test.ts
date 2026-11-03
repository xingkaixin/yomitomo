import { describe, expect, it } from 'vitest';
import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import { articleCounts } from '@yomitomo/core';
import type { ArticleSourceImportRepository } from './article-source-import';
import { commitTextSources } from './text-source-import';

describe('commitTextSources', () => {
  it('persists a text article with sanitized content', async () => {
    const saved: ArticleRecord[] = [];
    const repository: ArticleSourceImportRepository = {
      findArticleByIdentity: () => null,
      readArticle: async () => null,
      saveArticle: async (article) => {
        saved.push(article);
        if (article.sourceType !== 'text') throw new Error('expected text article');
        const {
          annotations,
          contentHtml: _contentHtml,
          focusCoReadingPlan: _focusCoReadingPlan,
          readerChatState: _readerChatState,
          ...summary
        } = article;
        return {
          type: 'article-upsert',
          article: { ...summary, counts: articleCounts({ annotations }) },
        } satisfies ArticleUpsertPatch;
      },
    };

    const result = await commitTextSources(
      {
        items: [
          {
            title: '我的笔记',
            author: '周明',
            format: 'markdown',
            body: '# 标题\n\n<script>alert(1)</script>正文',
          },
        ],
      },
      repository,
    );

    expect(result.articles).toHaveLength(1);
    const article = result.articles[0];
    expect(article.sourceType).toBe('text');
    expect(article.text).toEqual({ format: 'markdown' });
    expect(article.title).toBe('我的笔记');
    expect(article.byline).toBe('周明');
    expect(article.contentHtml).not.toContain('<script>');
    expect(article.contentHtml).toContain('正文');
    expect(saved).toHaveLength(1);
    expect(result.patches).toHaveLength(1);
  });
});
