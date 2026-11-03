// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import type { SourceReaderAdapter, SourceReaderAppSurface } from './use-source-reader-app';
import { useSourceReaderApp } from './use-source-reader-app';
import { articleActionStubs } from '../../__tests__/article-actions-test-utils';
import { appToast } from '../../shell/app-toast';

vi.mock('../../shell/app-toast', () => ({ appToast: { error: vi.fn() } }));
vi.mock('../../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
  stopAppSoundEffect: vi.fn(),
}));

const now = '2026-07-26T00:00:00.000Z';
const annotation: Annotation = {
  id: 'annotation_1',
  anchor: { exact: 'text', prefix: '', suffix: '', start: 0, end: 4 },
  author: { kind: 'user', username: 'reader' },
  color: '#f4c95d',
  comments: [],
  distillation: {
    status: 'published',
    content: 'distilled',
    publishedAt: now,
  },
  createdAt: now,
  updatedAt: now,
};
const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useSourceReaderApp', () => {
  it('reports annotation persistence failures without dismissing the composer', async () => {
    const currentArticle = article('web', 'article_1');
    const saveArticleAnnotation = vi.fn(() => Promise.reject(new Error('disk failed')));
    const articleActions = articleActionStubs({ saveArticleAnnotation });
    const onArticleChange = vi.fn();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          clearPendingOnArticleChange: true,
          clearPendingOnDeleteAnnotation: true,
          onArticleChange,
          userProfile,
        },
      }),
    );
    const selectionAction = { x: 12, y: 16, anchor: annotation.anchor };

    act(() => result.current.workspace.selection.openComposer(selectionAction));
    await act(async () => {
      await result.current
        .viewProps(surface({ onRevealReaderChatContext: vi.fn() }))
        .actions.annotation.onCreateAnnotation('note');
    });

    expect(saveArticleAnnotation).toHaveBeenCalledOnce();
    expect(onArticleChange).not.toHaveBeenCalled();
    expect(result.current.workspace.selection.composer).toMatchObject({
      anchor: annotation.anchor,
    });
    expect(appToast.error).toHaveBeenCalledWith('Save failed.', { description: 'disk failed' });
  });

  it('ignores repeat annotation submits while a save is pending', async () => {
    const currentArticle = article('web', 'article_1');
    let fail!: (error: Error) => void;
    const pending = new Promise<undefined>((_, reject) => {
      fail = reject;
    });
    const saveArticleAnnotation = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions: articleActionStubs({ saveArticleAnnotation }),
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          clearPendingOnArticleChange: true,
          clearPendingOnDeleteAnnotation: true,
          onArticleChange: vi.fn(),
          userProfile,
        },
      }),
    );

    act(() =>
      result.current.workspace.selection.openComposer({ x: 12, y: 16, anchor: annotation.anchor }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.createAnnotation('note');
    });
    await act(() => result.current.createAnnotation('note'));
    expect(saveArticleAnnotation).toHaveBeenCalledOnce();

    await act(async () => {
      fail(new Error('disk failed'));
      await expect(first).rejects.toThrow('disk failed');
    });
    await act(() => result.current.createAnnotation('note'));
    expect(saveArticleAnnotation).toHaveBeenCalledTimes(2);
  });
});

function article(sourceType: 'web' | 'ebook' | 'pdf', id: string): ArticleRecord {
  const base = {
    id,
    url: `${sourceType}:${id}`,
    canonicalUrl: `${sourceType}:${id}`,
    title: `${sourceType} article`,
    contentHash: `hash_${id}`,
    annotations: [annotation],
    createdAt: now,
    updatedAt: now,
  };

  switch (sourceType) {
    case 'web':
      return { ...base, sourceType };
    case 'ebook':
      return {
        ...base,
        sourceType,
        ebook: {
          metadata: { format: 'epub', fileName: 'book.epub', fileSize: 10 },
          chapters: [{ id: 'chapter_1', title: 'Chapter', html: '<p>text</p>', textLength: 4 }],
        },
      };
    case 'pdf':
      return {
        ...base,
        sourceType,
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'document.pdf',
            fileSize: 10,
            pageCount: 1,
          },
        },
      };
  }
}

function surface({
  onRevealReaderChatContext,
}: {
  onRevealReaderChatContext: NonNullable<SourceReaderAdapter['onRevealReaderChatContext']>;
}): SourceReaderAppSurface {
  return {
    adapter: {
      navigation: {
        onScrollToHeading: vi.fn(),
        onScrollToHighlight: vi.fn(),
      },
      onHighlightClick: vi.fn(),
      onRevealReaderChatContext,
      questionContext: (anchor) => ({ sourceType: 'web', quote: anchor.exact }),
      search: {
        revealSearchMatch: vi.fn(() => []),
        text: 'text',
      },
      selection: {
        onMouseUp: vi.fn(),
      },
    },
    annotations: {
      activeId: null,
      annotations: [annotation],
      boxes: [],
      filteredAnnotations: [annotation],
      temporaryBoxes: [],
    },
    article: {
      extracted: { title: 'Article', content: 'text' },
      id: 'article_1',
    },
    shell: { onClose: vi.fn() },
    toc: {
      annotationStats: new Map(),
      items: [],
    },
    userProfile,
  };
}
