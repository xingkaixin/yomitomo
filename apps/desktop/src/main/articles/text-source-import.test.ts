import { describe, expect, it } from 'vitest';
import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import type { ArticleSourceImportRepository } from './article-source-import';
import { commitTextSources, prepareTextSourceItems } from './text-source-import';

describe('prepareTextSourceItems', () => {
  it('infers title and author from pasted markdown front matter', () => {
    const result = prepareTextSourceItems({
      kind: 'paste',
      format: 'markdown',
      content: '---\ntitle: 札记\nauthor: 周明\n---\n# 忽略的标题\n正文',
    });
    expect(result.items).toEqual([
      {
        ok: true,
        format: 'markdown',
        suggestedTitle: '札记',
        suggestedAuthor: '周明',
        body: '# 忽略的标题\n正文',
      },
    ]);
  });

  it('rejects empty paste', () => {
    expect(prepareTextSourceItems({ kind: 'paste', format: 'plain', content: '   ' })).toEqual({
      items: [{ ok: false, reason: 'empty' }],
    });
  });

  it('decodes files and rejects binary content', () => {
    const text = new TextEncoder().encode('深夜随笔\n第二行').buffer;
    const binary = new Uint8Array([0x68, 0x00, 0x69]).buffer;
    const result = prepareTextSourceItems({
      kind: 'files',
      files: [
        { fileName: '随笔.txt', data: text },
        { fileName: 'note.md', data: binary },
      ],
    });
    expect(result.items[0]).toMatchObject({
      ok: true,
      format: 'plain',
      fileName: '随笔.txt',
      suggestedTitle: '随笔',
    });
    expect(result.items[1]).toEqual({ ok: false, fileName: 'note.md', reason: 'binary' });
  });
});

describe('commitTextSources', () => {
  it('persists a text article with sanitized content', async () => {
    const saved: ArticleRecord[] = [];
    const repository: ArticleSourceImportRepository = {
      findArticleByIdentity: () => null,
      readArticle: async () => null,
      saveArticle: async (article) => {
        saved.push(article);
        return { type: 'article-upsert', article } as ArticleUpsertPatch;
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
