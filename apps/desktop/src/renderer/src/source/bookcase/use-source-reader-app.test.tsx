// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import type { SourceReaderAdapter, SourceReaderAppSurface } from './use-source-reader-app';
import { useSourceReaderApp } from './use-source-reader-app';
import { articleActionStubs } from '../../__tests__/article-actions-test-utils';

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
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useSourceReaderApp', () => {
  it.each(['web', 'ebook', 'pdf'] as const)(
    'owns the shared %s reader session and workspace lifecycle',
    async (sourceType) => {
      const initialArticle = article(sourceType, `${sourceType}_1`);
      const articleActions = articleActionStubs();
      const { result, rerender } = renderHook(
        ({ currentArticle }) =>
          useSourceReaderApp({
            articleActions,
            canvasRef: { current: null },
            getArticleText: () => 'text',
            onRequestSelectionCopy: vi.fn(),
            session: {
              agents: [],
              annotations: currentArticle.annotations,
              article: currentArticle,
              clearPendingOnArticleChange: true,
              clearPendingOnDeleteAnnotation: true,
              onArticleChange: vi.fn(),
              onBeforeDeleteAnnotation: vi.fn(),
              userProfile,
            },
          }),
        { initialProps: { currentArticle: initialArticle } },
      );

      expect(result.current.session.annotations).toEqual([annotation]);
      expect(result.current.workspace.annotationTotals).toEqual({
        annotations: 1,
        distillations: 1,
      });

      act(() => result.current.setStatusMessage('working'));
      expect(result.current.statusMessage).toBe('working');

      rerender({ currentArticle: article(sourceType, `${sourceType}_2`) });
      await waitFor(() => expect(result.current.statusMessage).toBe(''));
    },
  );

  it('maps source adapters into the common ReaderAppView contract', () => {
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const onRevealReaderChatContext = vi.fn();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        canvasRef: { current: null },
        getArticleText: () => 'text',
        onRequestSelectionCopy: vi.fn(),
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          clearPendingOnArticleChange: true,
          clearPendingOnDeleteAnnotation: true,
          onArticleChange: vi.fn(),
          onBeforeDeleteAnnotation: vi.fn(),
          userProfile,
        },
      }),
    );

    const props = result.current.viewProps(surface({ onRevealReaderChatContext }));
    const sourceRect = { x: 1, y: 2, width: 3, height: 4 };
    props.actions.annotation.onOpenAnnotationDiscussion?.('annotation_1', sourceRect);
    void props.actions.chat?.onRevealContext?.({ sourceType: 'web', quote: 'quote' });

    expect(articleActions.openArticleDiscussion).toHaveBeenCalledWith(
      'article_1',
      'annotation_1',
      sourceRect,
    );
    expect(onRevealReaderChatContext).toHaveBeenCalledWith({ sourceType: 'web', quote: 'quote' });
    expect(props.annotations.annotationTotals).toEqual({
      annotations: 1,
      distillations: 1,
    });
    expect(props.options).toEqual({ embedded: true });
    expect(props.settings.settingsOpen).toBe(false);
  });

  it('owns annotation creation, opening, and selection questions', async () => {
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const beforeOpenAnnotation = vi.fn();
    const onOpenAnnotation = vi.fn();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        beforeOpenAnnotation,
        canvasRef: { current: null },
        getArticleText: () => 'text',
        onRequestSelectionCopy: vi.fn(),
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          clearPendingOnArticleChange: true,
          clearPendingOnDeleteAnnotation: true,
          onArticleChange: vi.fn(),
          onOpenAnnotation,
          userProfile,
        },
      }),
    );
    const selectionAction = { x: 12, y: 16, anchor: annotation.anchor };

    act(() => result.current.workspace.selection.openComposer(selectionAction));
    await act(() => result.current.createAnnotation('note'));

    expect(articleActions.saveArticleAnnotation).toHaveBeenCalledTimes(1);
    expect(beforeOpenAnnotation).toHaveBeenCalledTimes(1);
    expect(onOpenAnnotation).toHaveBeenCalledWith(expect.any(String));
    expect(result.current.newAnnotationIds.size).toBe(1);

    act(() => result.current.workspace.selection.openSelectionAction(selectionAction, []));
    act(() =>
      result.current.askSelection(selectionAction, (anchor) => ({
        sourceType: 'web',
        quote: anchor.exact,
      })),
    );

    expect(result.current.workspace.selection.selectionAction).toBeNull();
    expect(result.current.workspace.readerChat.model.draftContext).toEqual({
      sourceType: 'web',
      quote: 'text',
    });
  });

  it('owns default shell panels and preserves controlled overrides', () => {
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        canvasRef: { current: null },
        getArticleText: () => 'text',
        onRequestSelectionCopy: vi.fn(),
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
    const defaultSurface = surface({ onRevealReaderChatContext: vi.fn() });

    act(() => result.current.viewProps(defaultSurface).actions.toc.onToggleToc());
    expect(result.current.viewProps(defaultSurface).toc.open).toBe(true);

    act(() => result.current.viewProps(defaultSurface).actions.shell.onToggleSettings());
    expect(result.current.viewProps(defaultSurface).settings.settingsOpen).toBe(true);

    act(() => result.current.viewProps(defaultSurface).actions.shell.onCloseFloatingPanels());
    expect(result.current.viewProps(defaultSurface).settings.settingsOpen).toBe(false);

    const onCloseToc = vi.fn();
    const onToggleToc = vi.fn();
    const onToggleSettings = vi.fn();
    const controlledSurface: SourceReaderAppSurface = {
      ...defaultSurface,
      shell: {
        ...defaultSurface.shell,
        onCloseFloatingPanels: onCloseToc,
        onCloseResponsivePanels: onCloseToc,
        onToggleSettings,
        settingsOpen: false,
        showSettings: false,
      },
      toc: {
        ...defaultSurface.toc,
        onClose: onCloseToc,
        onToggle: onToggleToc,
        open: true,
      },
    };
    const props = result.current.viewProps(controlledSurface);

    props.actions.shell.onCloseFloatingPanels();
    props.actions.shell.onCloseResponsivePanels();
    props.actions.shell.onToggleSettings();
    props.actions.toc.onToggleToc();

    expect(props.toc.open).toBe(true);
    expect(onCloseToc).toHaveBeenCalledTimes(2);
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    expect(onToggleToc).toHaveBeenCalledTimes(1);
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
      selection: {
        onMouseUp: vi.fn(),
      },
    },
    agentPlayback: {
      dockCompleting: false,
      dockItems: [],
      theaterBoxes: [],
      virtualCursors: [],
    },
    annotations: {
      activeConnection: null,
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
