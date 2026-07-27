// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { articleCounts } from '@yomitomo/core';
import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  UserProfile,
} from '@yomitomo/shared';
import type { SourceBookcaseProps } from '../source/bookcase/app-source-bookcase';
import type { ArticleActions } from '../shell/app-article-store-actions';
import { ReadingLibrary } from '../reading-library/app-reading-library';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';
import { articleActionStubs } from './article-actions-test-utils';

const sourceBookcase = vi.hoisted(() => ({ props: null as SourceBookcaseProps | null }));

vi.mock('../source/bookcase/app-source-bookcase', () => ({
  SourceBookcase: (props: SourceBookcaseProps) => {
    sourceBookcase.props = props;
    return null;
  },
}));

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  sourceBookcase.props = null;
});

describe('ReadingLibrary article updates', () => {
  it('forwards granular agent annotation merges to the source reader', async () => {
    const selectedArticle = article();
    const annotation = annotationRecord();
    const onMergeArticleAgentAnnotation = vi.fn().mockResolvedValue(null);

    renderReadingLibrary({
      articleActions: articleActionStubs({
        mergeArticleAgentAnnotation: onMergeArticleAgentAnnotation,
        readArticle: vi.fn(async () => selectedArticle),
      }),
      articles: [selectedArticle],
      openArticleTarget: { articleId: selectedArticle.id },
    });

    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));
    await act(async () => {
      await sourceBookcase.props!.articleActions.mergeArticleAgentAnnotation(
        selectedArticle.id,
        annotation,
      );
    });

    expect(onMergeArticleAgentAnnotation).toHaveBeenCalledWith(selectedArticle.id, annotation);
  });

  it('uses the route article as the reader change owner', async () => {
    const selectedArticle = article();
    const changedArticle = article({
      title: 'Changed by reader',
      updatedAt: '2026-07-15T04:01:00.000Z',
    });

    renderReadingLibrary({
      articleActions: articleActionStubs({
        readArticle: vi.fn(async () => selectedArticle),
      }),
      articles: [selectedArticle],
      openArticleTarget: { articleId: selectedArticle.id },
    });
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));

    act(() => sourceBookcase.props?.annotationActions.onArticleChange(changedArticle));

    expect(sourceBookcase.props?.content.article).toEqual(changedArticle);
  });

  it('loads a PDF route only once', async () => {
    const selectedArticle: ArticleRecord = {
      ...article(),
      sourceType: 'pdf',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'article.pdf',
          fileSize: 1024,
          pageCount: 1,
        },
      },
    };
    const onReadArticle = vi.fn(async () => selectedArticle);

    renderReadingLibrary({
      articleActions: articleActionStubs({ readArticle: onReadArticle }),
      articles: [selectedArticle],
      openArticleTarget: { articleId: selectedArticle.id },
    });
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));
    await act(async () => undefined);

    expect(onReadArticle).toHaveBeenCalledTimes(1);
  });

  it('rehydrates a newer store summary into the current route article', async () => {
    const selectedArticle = article();
    const externalArticle = article({
      title: 'Changed externally',
      updatedAt: '2026-07-15T04:02:00.000Z',
    });
    const openArticleTarget = { articleId: selectedArticle.id };
    let readResult = selectedArticle;
    const onReadArticle = vi.fn(async () => readResult);
    const options = {
      articleActions: articleActionStubs({ readArticle: onReadArticle }),
      articles: [selectedArticle],
      openArticleTarget,
    };
    const view = renderReadingLibrary(options);
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));

    readResult = externalArticle;
    view.rerender(readingLibrary({ ...options, articles: [externalArticle] }));

    await waitFor(() =>
      expect(sourceBookcase.props?.content.article?.title).toBe('Changed externally'),
    );
    expect(onReadArticle).toHaveBeenCalledTimes(2);
  });

  it('does not rehydrate a store summary older than a local route change', async () => {
    const selectedArticle = article();
    const localArticle = article({
      title: 'Changed locally',
      updatedAt: '2026-07-15T04:03:00.000Z',
    });
    const staleExternalArticle = article({
      title: 'Stale external change',
      updatedAt: '2026-07-15T04:02:00.000Z',
    });
    const openArticleTarget = { articleId: selectedArticle.id };
    const onReadArticle = vi.fn(async () => selectedArticle);
    const options = {
      articleActions: articleActionStubs({ readArticle: onReadArticle }),
      articles: [selectedArticle],
      openArticleTarget,
    };
    const view = renderReadingLibrary(options);
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));

    act(() => sourceBookcase.props?.annotationActions.onArticleChange(localArticle));
    view.rerender(readingLibrary({ ...options, articles: [staleExternalArticle] }));

    await act(async () => undefined);
    expect(sourceBookcase.props?.content.article?.title).toBe('Changed locally');
    expect(onReadArticle).toHaveBeenCalledTimes(1);
  });
});

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-07-15T04:00:00.000Z',
};

function renderReadingLibrary(options: ReadingLibraryTestOptions) {
  return render(readingLibrary(options));
}

function readingLibrary({
  articleActions,
  articles,
  openArticleTarget,
}: ReadingLibraryTestOptions) {
  return (
    <ReadingLibrary
      agents={[]}
      articleActions={articleActions}
      articles={articles.map(articleSummary)}
      {...collectionActionStubs()}
      openArticleTarget={openArticleTarget}
      readerTheme={defaultTheme.reader}
      userProfile={userProfile}
    />
  );
}

function collectionActionStubs() {
  return {
    onAddCollectionMembers: vi.fn(),
    onCreateCollection: vi.fn(),
    onDeleteCollection: vi.fn(),
    onRemoveCollectionMember: vi.fn(),
    onRenameCollection: vi.fn(),
    onSetLibraryPin: vi.fn(),
  };
}

type ReadingLibraryTestOptions = {
  articleActions: ArticleActions;
  articles: ArticleRecord[];
  openArticleTarget: { articleId: string; annotationId?: string };
};

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function article(overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    title: 'Article',
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: '2026-07-15T04:00:00.000Z',
    updatedAt: '2026-07-15T04:00:00.000Z',
    ...overrides,
  };
}

function articleSummary(record: ArticleRecord): ArticleSummaryRecord {
  const {
    annotations: _annotations,
    contentHtml: _contentHtml,
    focusCoReadingPlan: _focusCoReadingPlan,
    readerChatState: _readerChatState,
    ...summary
  } = record;
  return {
    ...summary,
    annotations: [],
    counts: articleCounts(record),
  };
}

function annotationRecord(): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
    color: '#8a8f4f',
    comments: [],
    createdAt: '2026-07-15T04:30:00.000Z',
    updatedAt: '2026-07-15T04:30:00.000Z',
  };
}
