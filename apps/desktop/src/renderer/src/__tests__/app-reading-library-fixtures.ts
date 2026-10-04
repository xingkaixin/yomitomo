import type { Annotation, ArticleRecord } from '@yomitomo/shared';

export const now = '2026-05-09T12:00:00.000Z';

export function annotation(id: string, createdAt = now): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt,
    updatedAt: createdAt,
  };
}

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;
type EbookArticleRecord = Extract<ArticleRecord, { sourceType: 'ebook' }>;
type PdfArticleRecord = Extract<ArticleRecord, { sourceType: 'pdf' }>;
type TextArticleRecord = Extract<ArticleRecord, { sourceType: 'text' }>;
type ArticleInput =
  | (Partial<WebArticleRecord> & { sourceType?: 'web' })
  | (Partial<EbookArticleRecord> & Pick<EbookArticleRecord, 'sourceType' | 'ebook'>)
  | (Partial<PdfArticleRecord> & Pick<PdfArticleRecord, 'sourceType' | 'pdf'>)
  | (Partial<TextArticleRecord> & Pick<TextArticleRecord, 'sourceType' | 'text'>);

export function article(overrides: ArticleInput = {}): ArticleRecord {
  const base = {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };

  switch (overrides.sourceType) {
    case 'ebook':
      return { ...base, ...overrides, sourceType: 'ebook', ebook: overrides.ebook };
    case 'pdf':
      return { ...base, ...overrides, sourceType: 'pdf', pdf: overrides.pdf };
    case 'text':
      return { ...base, ...overrides, sourceType: 'text', text: overrides.text };
    default:
      return { ...base, ...overrides, sourceType: 'web' };
  }
}

export function annotationWithPublishedDistillation(id: string): Annotation {
  return {
    ...annotation(id),
    distillation: {
      status: 'published',
      content: `沉淀 ${id}`,
      publishedAt: '2026-05-09T12:04:00.000Z',
    },
  };
}
