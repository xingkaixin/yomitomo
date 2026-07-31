// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { articleCounts } from '@yomitomo/core';
import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  UserProfile,
} from '@yomitomo/shared';
import type { SourceBookcaseProps } from '../source/bookcase/app-source-bookcase';
import type { LibraryHome } from '../reading-library/app-reading-library-home';
import type { CurrentArticleSink } from '../shell/app-article-store';
import type { ArticleActions } from '../shell/app-article-store-actions';
import { ReadingLibrary } from '../reading-library/app-reading-library';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';
import { articleActionStubs, articleStoreSinkStub } from './article-actions-test-utils';

const sourceBookcase = vi.hoisted(() => ({ props: null as SourceBookcaseProps | null }));
type LibraryHomeProps = ComponentProps<typeof LibraryHome>;
const libraryHome = vi.hoisted(() => ({ props: null as LibraryHomeProps | null }));
const defaultArticleStore = articleStoreSinkStub();

vi.mock('../source/bookcase/app-source-bookcase', () => ({
  SourceBookcase: (props: SourceBookcaseProps) => {
    sourceBookcase.props = props;
    return <div data-testid="source-bookcase" />;
  },
}));

vi.mock('../reading-library/app-reading-library-home', () => ({
  LibraryHome: (props: LibraryHomeProps) => {
    libraryHome.props = props;
    return <div data-testid="library-home" />;
  },
}));

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  libraryHome.props = null;
  sourceBookcase.props = null;
});

describe('ReadingLibrary article updates', () => {
  it('registers and unregisters the navigation current-article sink', async () => {
    const selectedArticle = article();
    const unregister = vi.fn();
    const registerCurrentArticleSink = vi.fn(() => unregister);
    const view = renderReadingLibrary({
      articleActions: articleActionStubs({
        readArticle: vi.fn(async () => selectedArticle),
      }),
      articleStore: articleStoreSinkStub(registerCurrentArticleSink),
      articles: [selectedArticle],
      openArticleTarget: { articleId: selectedArticle.id },
    });

    await waitFor(() => expect(registerCurrentArticleSink).toHaveBeenCalledOnce());
    view.unmount();

    expect(unregister).toHaveBeenCalledOnce();
  });

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

  it('does not rehydrate when current reconciliation matches the summary revision', async () => {
    const selectedAnnotation = annotationRecord();
    const selectedArticle = article({ annotations: [selectedAnnotation] });
    const reconciledArticle = article({
      annotations: [],
      updatedAt: '2026-07-15T04:03:00.000Z',
    });
    const openArticleTarget = { articleId: selectedArticle.id };
    const onReadArticle = vi.fn(async () => selectedArticle);
    let currentSink: CurrentArticleSink | null = null;
    const articleStore = articleStoreSinkStub((sink) => {
      currentSink = sink;
      return () => {
        if (currentSink === sink) currentSink = null;
      };
    });
    const options = {
      articleActions: articleActionStubs({ readArticle: onReadArticle }),
      articleStore,
      articles: [selectedArticle],
      openArticleTarget,
    };
    const view = renderReadingLibrary(options);
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(selectedArticle.id));
    await waitFor(() => expect(currentSink).not.toBeNull());

    act(() => {
      expect(currentSink?.isCurrent(selectedArticle.id)).toBe(true);
      currentSink?.apply({
        type: 'update',
        articleId: selectedArticle.id,
        update: (current) => ({
          ...current,
          annotations: [],
          updatedAt: reconciledArticle.updatedAt,
        }),
      });
    });
    view.rerender(readingLibrary({ ...options, articles: [reconciledArticle] }));
    await act(async () => undefined);

    expect(sourceBookcase.props?.content.article).toMatchObject({
      annotations: [],
      updatedAt: reconciledArticle.updatedAt,
    });
    expect(onReadArticle).toHaveBeenCalledTimes(1);
  });

  it('keeps a route outside the sparse catalog until its delete projection arrives', async () => {
    const selectedArticle = article();
    const unrelatedArticle = article({
      id: 'article_2',
      url: 'https://example.com/other',
      canonicalUrl: 'https://example.com/other',
      contentHash: 'hash_2',
    });
    const openArticleTarget = { articleId: selectedArticle.id };
    let currentSink: CurrentArticleSink | null = null;
    const articleStore = articleStoreSinkStub((sink) => {
      currentSink = sink;
      return () => {
        if (currentSink === sink) currentSink = null;
      };
    });
    const options = {
      articleActions: articleActionStubs({
        readArticle: vi.fn(async () => selectedArticle),
      }),
      articleStore,
      articles: [unrelatedArticle],
      openArticleTarget,
    };
    renderReadingLibrary(options);
    await screen.findByTestId('source-bookcase');
    await waitFor(() => expect(currentSink).not.toBeNull());
    await act(async () => undefined);

    expect(screen.getByTestId('source-bookcase')).not.toBeNull();
    act(() => {
      currentSink?.apply({ type: 'delete', articleId: selectedArticle.id });
    });
    await waitFor(() => expect(screen.queryByTestId('source-bookcase')).toBeNull());
  });

  it('does not close a newly opened article when an older delete finishes', async () => {
    const firstArticle = article();
    const secondArticle = article({
      id: 'article_2',
      url: 'https://example.com/second',
      canonicalUrl: 'https://example.com/second',
      contentHash: 'hash_2',
    });
    const deletion = deferred<void>();
    let currentSink: CurrentArticleSink | null = null;
    const articleStore = articleStoreSinkStub((sink) => {
      currentSink = sink;
      return () => {
        if (currentSink === sink) currentSink = null;
      };
    });
    const deleteArticle = vi.fn((articleId: string) => {
      currentSink?.apply({ type: 'delete', articleId });
      return deletion.promise;
    });

    renderReadingLibrary({
      articleActions: articleActionStubs({
        deleteArticle,
        readArticle: vi.fn(async (articleId) =>
          articleId === firstArticle.id ? firstArticle : secondArticle,
        ),
      }),
      articleStore,
      articles: [firstArticle, secondArticle],
      openArticleTarget: { articleId: firstArticle.id },
    });
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(firstArticle.id));

    act(() => sourceBookcase.props?.readerControl.onClose());
    await screen.findByTestId('library-home');

    let pendingDelete!: Promise<void>;
    act(() => {
      pendingDelete = libraryHome.props!.itemActions.onDeleteArticle(firstArticle.id);
    });
    act(() => {
      libraryHome.props!.itemActions.onOpenArticle(secondArticle);
    });
    await waitFor(() => expect(sourceBookcase.props?.content.article?.id).toBe(secondArticle.id));

    await act(async () => {
      deletion.resolve();
      await pendingDelete;
    });

    expect(sourceBookcase.props?.content.article?.id).toBe(secondArticle.id);
    expect(screen.getByTestId('source-bookcase')).not.toBeNull();
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
  articleStore,
  articles,
  openArticleTarget,
}: ReadingLibraryTestOptions) {
  return (
    <ReadingLibrary
      agents={[]}
      articleActions={articleActions}
      articleStore={articleStore || defaultArticleStore}
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
  articleStore?: ReturnType<typeof articleStoreSinkStub>;
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
