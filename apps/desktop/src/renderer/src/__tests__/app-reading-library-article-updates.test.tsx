// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, ArticleSummaryRecord, UserProfile } from '@yomitomo/shared';
import type { SourceBookcaseProps } from '../source/bookcase/app-source-bookcase-shared';
import { ReadingLibrary } from '../reading-library/app-reading-library';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';

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
  it('applies updates to the latest persisted article snapshot', async () => {
    const selectedArticle = article();
    const freshArticle = {
      ...selectedArticle,
      readerChatState: {
        articleId: selectedArticle.id,
        messages: [],
        updatedAt: '2026-07-15T04:30:00.000Z',
      },
      updatedAt: '2026-07-15T04:30:00.000Z',
    };
    let savedArticle: ArticleRecord | null = null;
    const onUpdateArticle = vi.fn(async (_articleId, update) => {
      savedArticle = update(freshArticle);
    });

    renderReadingLibrary({
      articles: [selectedArticle],
      openArticleId: selectedArticle.id,
      onReadArticle: vi.fn(async () => selectedArticle),
      onUpdateArticle,
    });

    await waitFor(() => expect(sourceBookcase.props?.article?.id).toBe(selectedArticle.id));
    await act(async () => {
      await sourceBookcase.props!.onUpdateArticle(selectedArticle.id, (current) => ({
        ...current,
        title: 'stream update',
      }));
    });

    expect(savedArticle).toMatchObject({
      title: 'stream update',
      readerChatState: freshArticle.readerChatState,
    });
  });

  it('does not replace the current selection when an older update finishes', async () => {
    const firstArticle = article({ id: 'article_1', title: 'First article' });
    const secondArticle = article({ id: 'article_2', title: 'Second article' });
    const persistence = createDeferred<void>();
    const onReadArticle = vi.fn(async (articleId: string) =>
      articleId === firstArticle.id ? firstArticle : secondArticle,
    );
    const onUpdateArticle = vi.fn(async (_articleId, update) => {
      await persistence.promise;
      update(firstArticle);
    });
    const view = renderReadingLibrary({
      articles: [firstArticle, secondArticle],
      openArticleId: firstArticle.id,
      onReadArticle,
      onUpdateArticle,
    });

    await waitFor(() => expect(sourceBookcase.props?.article?.id).toBe(firstArticle.id));
    const updateFirstArticle = sourceBookcase.props!.onUpdateArticle(
      firstArticle.id,
      (current) => ({ ...current, title: 'Updated first article' }),
    );
    await waitFor(() => expect(onUpdateArticle).toHaveBeenCalledOnce());

    view.rerender(
      readingLibrary({
        articles: [firstArticle, secondArticle],
        openArticleId: secondArticle.id,
        onReadArticle,
        onUpdateArticle,
      }),
    );
    await waitFor(() => expect(sourceBookcase.props?.article?.id).toBe(secondArticle.id));

    persistence.resolve();
    await act(async () => {
      await updateFirstArticle;
    });

    expect(sourceBookcase.props?.article?.id).toBe(secondArticle.id);
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
  articles,
  openArticleId,
  onReadArticle,
  onUpdateArticle,
}: ReadingLibraryTestOptions) {
  return (
    <ReadingLibrary
      agents={[]}
      articles={articles.map(articleSummary)}
      openArticleId={openArticleId}
      readerTheme={defaultTheme.reader}
      userProfile={userProfile}
      onDeleteArticle={vi.fn()}
      onImportEbookFile={vi.fn()}
      onImportPdfFile={vi.fn()}
      onImportArticleUrl={vi.fn()}
      onReadArticle={onReadArticle}
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={vi.fn()}
      onUpdateArticle={onUpdateArticle}
    />
  );
}

type ReadingLibraryTestOptions = {
  articles: ArticleRecord[];
  openArticleId: string;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  onUpdateArticle: SourceBookcaseProps['onUpdateArticle'];
};

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
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
  const summary = { ...record };
  delete summary.contentHtml;
  return summary;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
