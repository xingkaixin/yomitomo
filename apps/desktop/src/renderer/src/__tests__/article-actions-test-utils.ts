import { vi } from 'vitest';
import { articleCounts } from '@yomitomo/core';
import type { Annotation, ArticleRecord, ArticleSummaryRecord, Comment } from '@yomitomo/shared';
import type { ArticleStore } from '../shell/app-article-store';
import type { ArticleActions } from '../shell/app-article-store-actions';

export function articleStoreSinkStub(
  registerCurrentArticleSink: ArticleStore['registerCurrentArticleSink'] = vi.fn(() => vi.fn()),
): Pick<ArticleStore, 'registerCurrentArticleSink'> {
  return { registerCurrentArticleSink };
}

export function articleActionStubs(overrides: Partial<ArticleActions> = {}): ArticleActions {
  return {
    cancelArticleUrlImport: vi.fn<ArticleActions['cancelArticleUrlImport']>(),
    commitTextImport: vi.fn<ArticleActions['commitTextImport']>(),
    closeArticleDiscussions: vi.fn<ArticleActions['closeArticleDiscussions']>(),
    deleteArticle: vi.fn<ArticleActions['deleteArticle']>(),
    deleteArticleAnnotation: vi.fn<ArticleActions['deleteArticleAnnotation']>(),
    deleteArticleComment: vi.fn<ArticleActions['deleteArticleComment']>(),
    importArticleUrl: vi.fn<ArticleActions['importArticleUrl']>(),
    importEbookFile: vi.fn<ArticleActions['importEbookFile']>(),
    importPdfFile: vi.fn<ArticleActions['importPdfFile']>(),
    mergeArticleAgentAnnotation: vi.fn<ArticleActions['mergeArticleAgentAnnotation']>(),
    openArticleDiscussion: vi.fn<ArticleActions['openArticleDiscussion']>(),
    readArticle: vi.fn<ArticleActions['readArticle']>(),
    saveArticleAnnotation: vi.fn<ArticleActions['saveArticleAnnotation']>(),
    saveArticleComment: vi.fn<ArticleActions['saveArticleComment']>(),
    saveArticleReaderChatState: vi.fn<ArticleActions['saveArticleReaderChatState']>(),
    saveArticleReadingProgress: vi.fn<ArticleActions['saveArticleReadingProgress']>(),
    ...overrides,
  };
}

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;
type WebArticleSummaryRecord = Extract<ArticleSummaryRecord, { sourceType: 'web' }>;

export function webArticleRecord(
  id = 'article_1',
  overrides: Partial<WebArticleRecord> = {},
): WebArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    sourceType: 'web',
    title: id,
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: `hash_${id}`,
    annotations: [],
    createdAt: '2026-05-17T07:00:00.000Z',
    updatedAt: '2026-05-17T07:00:00.000Z',
    ...overrides,
  };
}

export function articleSummaryFromRecord(record: WebArticleRecord): WebArticleSummaryRecord {
  const {
    annotations,
    contentHtml: _contentHtml,
    focusCoReadingPlan: _focusCoReadingPlan,
    readerChatState: _readerChatState,
    ...summary
  } = record;
  return {
    ...summary,
    annotations: [],
    counts: articleCounts({ annotations }),
  };
}

export function annotationFixture(
  id = 'annotation_1',
  overrides: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    anchor: {
      exact: 'highlight',
      prefix: '',
      suffix: '',
      start: 0,
      end: 9,
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-17T07:30:00.000Z',
    updatedAt: '2026-05-17T07:30:00.000Z',
    ...overrides,
  };
}

export function commentFixture(id = 'comment_1', overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    author: { kind: 'user', username: 'reader' },
    content: 'comment',
    createdAt: '2026-05-17T07:45:00.000Z',
    ...overrides,
  };
}
