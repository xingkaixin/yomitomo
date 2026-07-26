// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import type { SourceReaderAppSurface } from './use-source-reader-app';
import { useSourceReaderApp } from './use-source-reader-app';

const now = '2026-07-26T00:00:00.000Z';
const annotation: Annotation = {
  id: 'annotation_1',
  anchor: { exact: 'text', prefix: '', suffix: '', start: 0, end: 4 },
  author: 'user',
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
      const { result, rerender } = renderHook(
        ({ currentArticle }) =>
          useSourceReaderApp({
            canvasRef: { current: null },
            getArticleText: () => 'text',
            session: {
              agents: [],
              annotations: currentArticle.annotations,
              article: currentArticle,
              onArticleChange: vi.fn(),
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
    const onOpenAnnotationDiscussion = vi.fn();
    const onRevealReaderChatContext = vi.fn();
    const { result } = renderHook(() =>
      useSourceReaderApp({
        canvasRef: { current: null },
        getArticleText: () => 'text',
        session: {
          agents: [],
          annotations: currentArticle.annotations,
          article: currentArticle,
          onArticleChange: vi.fn(),
          userProfile,
        },
      }),
    );

    const props = result.current.viewProps(
      surface({ onOpenAnnotationDiscussion, onRevealReaderChatContext }),
    );
    const sourceRect = { x: 1, y: 2, width: 3, height: 4 };
    props.actions.annotation.onOpenAnnotationDiscussion?.('annotation_1', sourceRect);
    void props.actions.chat?.onRevealContext?.({ sourceType: 'web', quote: 'quote' });

    expect(onOpenAnnotationDiscussion).toHaveBeenCalledWith(
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
});

function article(sourceType: 'web' | 'ebook' | 'pdf', id: string): ArticleRecord {
  return {
    id,
    url: `${sourceType}:${id}`,
    canonicalUrl: `${sourceType}:${id}`,
    sourceType,
    title: `${sourceType} article`,
    contentHash: `hash_${id}`,
    annotations: [annotation],
    createdAt: now,
    updatedAt: now,
    ...(sourceType === 'ebook'
      ? {
          ebook: {
            metadata: { format: 'epub' as const, fileName: 'book.epub', fileSize: 10 },
            chapters: [{ id: 'chapter_1', title: 'Chapter', html: '<p>text</p>', textLength: 4 }],
          },
        }
      : {}),
    ...(sourceType === 'pdf'
      ? {
          pdf: {
            metadata: {
              format: 'pdf' as const,
              fileName: 'document.pdf',
              fileSize: 10,
              pageCount: 1,
            },
          },
        }
      : {}),
  };
}

function surface({
  onOpenAnnotationDiscussion,
  onRevealReaderChatContext,
}: {
  onOpenAnnotationDiscussion: NonNullable<
    SourceReaderAppSurface['actions']['onOpenAnnotationDiscussion']
  >;
  onRevealReaderChatContext: NonNullable<
    SourceReaderAppSurface['actions']['onRevealReaderChatContext']
  >;
}): SourceReaderAppSurface {
  return {
    actions: {
      annotation: {
        onAddComment: vi.fn(),
        onClearActiveAnnotation: vi.fn(),
        onCreateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
        onDeleteComment: vi.fn(),
        onFocusAnnotation: vi.fn(),
        onHighlightClick: vi.fn(),
        onScrollToHighlight: vi.fn(),
      },
      selection: {
        onCancelComposer: vi.fn(),
        onClearSelection: vi.fn(),
        onCloseHighlightChoice: vi.fn(),
        onCopySelection: vi.fn(),
        onMouseUp: vi.fn(),
        onOpenComposer: vi.fn(),
      },
      shell: {
        onClose: vi.fn(),
        onCloseFloatingPanels: vi.fn(),
        onCloseResponsivePanels: vi.fn(),
        onToggleSettings: vi.fn(),
        onUpdateReaderSettings: vi.fn(),
      },
      toc: {
        onScrollToHeading: vi.fn(),
        onToggleToc: vi.fn(),
      },
      onOpenAnnotationDiscussion,
      onRevealReaderChatContext,
    },
    agentPlayback: {
      completionBurstKey: 0,
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
    refs: {
      articleRef: { current: null },
      canvasRef: { current: null },
      noteRefs: { current: new Map() },
      notesRef: { current: null },
      surfaceRef: { current: null },
    },
    toc: {
      annotationStats: new Map(),
      items: [],
      open: false,
    },
    userProfile,
  };
}
