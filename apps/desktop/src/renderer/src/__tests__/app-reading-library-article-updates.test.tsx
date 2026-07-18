// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  UserProfile,
} from '@yomitomo/shared';
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
  it('forwards granular agent annotation merges to the source reader', async () => {
    const selectedArticle = article();
    const annotation = annotationRecord();
    const onMergeArticleAgentAnnotation = vi.fn().mockResolvedValue(null);

    renderReadingLibrary({
      articles: [selectedArticle],
      openArticleTarget: { articleId: selectedArticle.id },
      onReadArticle: vi.fn(async () => selectedArticle),
      onMergeArticleAgentAnnotation,
    });

    await waitFor(() => expect(sourceBookcase.props?.article?.id).toBe(selectedArticle.id));
    await act(async () => {
      await sourceBookcase.props!.onMergeArticleAgentAnnotation?.(selectedArticle.id, annotation);
    });

    expect(onMergeArticleAgentAnnotation).toHaveBeenCalledWith(selectedArticle.id, annotation);
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
  openArticleTarget,
  onReadArticle,
  onMergeArticleAgentAnnotation,
}: ReadingLibraryTestOptions) {
  return (
    <ReadingLibrary
      agents={[]}
      articles={articles.map(articleSummary)}
      openArticleTarget={openArticleTarget}
      readerTheme={defaultTheme.reader}
      userProfile={userProfile}
      onDeleteArticle={vi.fn()}
      onImportEbookFile={vi.fn()}
      onImportPdfFile={vi.fn()}
      onImportArticleUrl={vi.fn()}
      onMergeArticleAgentAnnotation={onMergeArticleAgentAnnotation}
      onReadArticle={onReadArticle}
      onSaveArticleReadingProgress={vi.fn()}
    />
  );
}

type ReadingLibraryTestOptions = {
  articles: ArticleRecord[];
  openArticleTarget: { articleId: string; annotationId?: string };
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  onMergeArticleAgentAnnotation: SourceBookcaseProps['onMergeArticleAgentAnnotation'];
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

function annotationRecord(): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: 'ai',
    color: '#8a8f4f',
    comments: [],
    createdAt: '2026-07-15T04:30:00.000Z',
    updatedAt: '2026-07-15T04:30:00.000Z',
  };
}
