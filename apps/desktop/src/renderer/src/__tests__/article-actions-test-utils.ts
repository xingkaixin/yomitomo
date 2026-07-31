import { vi } from 'vitest';
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
