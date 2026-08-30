// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import type { SourceReaderAdapter, SourceReaderAppSurface } from './use-source-reader-app';
import { useSourceReaderApp } from './use-source-reader-app';
import { useSourceReaderAppView } from './use-source-reader-app-view';
import { articleActionStubs } from '../../__tests__/article-actions-test-utils';
import { appToast } from '../../shell/app-toast';

const release = vi.hoisted(() => ({ enabled: undefined as boolean | undefined }));

vi.mock('../../../../reading-memory-release', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../reading-memory-release')>();
  return {
    get readingMemoryEnabled() {
      return release.enabled ?? actual.readingMemoryEnabled;
    },
  };
});

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
  release.enabled = undefined;
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useSourceReaderApp', () => {
  it.each([false, true])('exposes related reading only in the enabled build (%s)', (enabled) => {
    release.enabled = enabled ? undefined : false;
    const search = vi.fn().mockRejectedValue(new Error('Local fixture search unavailable'));
    vi.stubGlobal('yomitomoDesktop', {
      readingMemory: { relations: { search, cancel: vi.fn().mockResolvedValue(undefined) } },
    });
    const currentArticle = article('web', 'article_1');
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions: articleActionStubs(),
        onOpenEvidenceSource: vi.fn(),
        getArticleText: () => 'text',
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
    const readerSurface = surface({ onRevealReaderChatContext: vi.fn() });
    const props = result.current.viewProps(readerSurface);
    expect(search).not.toHaveBeenCalled();
    if (!enabled) {
      expect(props.actions.selection.onFindRelated).toBeUndefined();
      expect(props.overlays).toBeNull();
      return;
    }
    expect(props.actions.selection.onFindRelated).toBeTypeOf('function');
    act(() => props.actions.selection.onFindRelated?.({ x: 0, y: 0, anchor: annotation.anchor }));
    expect(search).toHaveBeenCalledOnce();
    expect(result.current.viewProps(readerSurface).overlays).not.toBeNull();
  });

  it.each(['web', 'ebook', 'pdf'] as const)(
    'owns the shared %s reader session and workspace lifecycle',
    async (sourceType) => {
      const initialArticle = article(sourceType, `${sourceType}_1`);
      const articleActions = articleActionStubs();
      const { result, rerender } = renderHook(
        ({ currentArticle }) =>
          useSourceReaderApp({
            articleActions,
            getArticleText: () => 'text',
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
        getArticleText: () => 'text',
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
        getArticleText: () => 'text',
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

  it('reports annotation persistence failures without dismissing the composer', async () => {
    const currentArticle = article('web', 'article_1');
    const saveArticleAnnotation = vi.fn(() => Promise.reject(new Error('disk failed')));
    const articleActions = articleActionStubs({ saveArticleAnnotation });
    const onArticleChange = vi.fn();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        getArticleText: () => 'text',
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

  it('keeps the new article composer open when an old annotation save completes', async () => {
    let complete!: () => void;
    const pending = new Promise<undefined>((resolve) => {
      complete = () => resolve(undefined);
    });
    const onOpenAnnotation = vi.fn();
    const articleActions = articleActionStubs({ saveArticleAnnotation: () => pending });
    const { result, rerender } = renderHook(
      ({ currentArticle }) =>
        useSourceReaderApp({
          articleActions,
          getArticleText: () => 'text',
          session: {
            agents: [],
            article: currentArticle,
            annotations: currentArticle.annotations,
            clearPendingOnArticleChange: true,
            clearPendingOnDeleteAnnotation: true,
            onArticleChange: vi.fn(),
            onOpenAnnotation,
            userProfile,
          },
        }),
      { initialProps: { currentArticle: article('web', 'article_1') } },
    );
    act(() =>
      result.current.workspace.selection.openComposer({ x: 12, y: 16, anchor: annotation.anchor }),
    );
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.createAnnotation('old note');
    });
    rerender({ currentArticle: article('web', 'article_2') });
    const newAnchor = { ...annotation.anchor, exact: 'new text' };
    act(() => result.current.workspace.selection.openComposer({ x: 12, y: 16, anchor: newAnchor }));
    await act(async () => {
      complete();
      await saving;
    });
    expect(result.current.workspace.selection.composer?.anchor).toEqual(newAnchor);
    expect(result.current.newAnnotationIds.size).toBe(0);
    expect(onOpenAnnotation).not.toHaveBeenCalled();
  });

  it('owns default shell panels and preserves controlled overrides', () => {
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        articleActions,
        getArticleText: () => 'text',
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

  it('cancels stale asynchronous search reveals and decorates result boxes', async () => {
    vi.useFakeTimers();
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const first =
      deferred<Array<{ id: string; top: number; left: number; width: number; height: number }>>();
    const second =
      deferred<Array<{ id: string; top: number; left: number; width: number; height: number }>>();
    const revealSearchMatch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => {
      const app = useSourceReaderApp({
        articleActions,
        getArticleText: () => 'text',
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          clearPendingOnArticleChange: true,
          clearPendingOnDeleteAnnotation: true,
          onArticleChange: vi.fn(),
          userProfile,
        },
      });
      const readerSurface = surface({ onRevealReaderChatContext: vi.fn() });
      return useSourceReaderAppView({
        ...readerSurface,
        app,
        adapter: {
          ...readerSurface.adapter,
          search: { revealSearchMatch, text: 'alpha alpha' },
        },
      });
    });

    act(() => {
      const search = result.current.viewProps.toolbar?.search;
      search?.onOpen();
      search?.onQueryChange('alpha');
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(revealSearchMatch).toHaveBeenCalledTimes(1);

    act(() => result.current.viewProps.toolbar?.search?.onNextMatch());
    expect(revealSearchMatch).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve([{ id: 'new', top: 2, left: 3, width: 4, height: 5 }]);
    });
    expect(result.current.viewProps.annotations.searchBoxes).toEqual([
      {
        annotationId: '__search__',
        color: 'var(--reader-search-highlight-active)',
        contributorId: '__search__',
        height: 5,
        id: 'new',
        left: 3,
        top: 2,
        width: 4,
      },
    ]);

    await act(async () => {
      first.resolve([{ id: 'old', top: 0, left: 0, width: 1, height: 1 }]);
    });
    expect(result.current.viewProps.annotations.searchBoxes?.[0]?.id).toBe('new');
  });

  it('keeps a stable reveal idle and uses an updated reveal callback', async () => {
    vi.useFakeTimers();
    const currentArticle = article('web', 'article_1');
    const articleActions = articleActionStubs();
    const initialReveal = vi.fn(() => [searchBox('initial')]);
    const updatedReveal = vi.fn(() => [searchBox('updated')]);
    const { result, rerender } = renderHook(
      ({ revealSearchMatch }) => {
        const app = useSourceReaderApp({
          articleActions,
          getArticleText: () => 'text',
          session: {
            agents: [],
            annotations: currentArticle.annotations,
            article: currentArticle,
            clearPendingOnArticleChange: true,
            clearPendingOnDeleteAnnotation: true,
            onArticleChange: vi.fn(),
            userProfile,
          },
        });
        const readerSurface = surface({ onRevealReaderChatContext: vi.fn() });
        return useSourceReaderAppView({
          ...readerSurface,
          app,
          adapter: {
            ...readerSurface.adapter,
            search: { revealSearchMatch, text: 'alpha' },
          },
        });
      },
      { initialProps: { revealSearchMatch: initialReveal } },
    );

    act(() => {
      const search = result.current.viewProps.toolbar?.search;
      search?.onOpen();
      search?.onQueryChange('alpha');
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(initialReveal).toHaveBeenCalledTimes(1);
    expect(result.current.viewProps.annotations.searchBoxes?.[0]?.id).toBe('initial');
    expect(initialReveal).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ revealSearchMatch: updatedReveal });
    });

    expect(updatedReveal).toHaveBeenCalledTimes(1);
    expect(result.current.viewProps.annotations.searchBoxes?.[0]?.id).toBe('updated');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function searchBox(id: string) {
  return { id, top: 2, left: 3, width: 4, height: 5 };
}

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
    agentPlayback: {
      dockCompleting: false,
      dockItems: [],
      theaterBoxes: [],
      virtualCursors: [],
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
