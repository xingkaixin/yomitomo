// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type { EbookPageTurnTrace } from '../source/ebook/app-ebook-reader-utils';
import { EbookBookcase } from '../source/ebook/app-source-bookcase-ebook';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase-shared';
import { defaultTheme } from '../theme/app-theme';

const mocks = vi.hoisted(() => ({
  attachFoliateDocumentListeners: vi.fn(),
  cleanupAgentTheater: vi.fn(),
  cleanupFoliateDocumentListeners: vi.fn(),
  goLeft: vi.fn(),
  goRight: vi.fn(),
  goToProgress: vi.fn(),
  goToTocItem: vi.fn(),
  hideEbookBoxLayer: vi.fn(),
  resetEbookBoxState: vi.fn(),
  scheduleEbookBoxUpdate: vi.fn(),
  setAgentTheaterBoxes: vi.fn(),
  boxes: [] as HighlightBox[],
  readerShellProps: undefined as
    | {
        readerApp: {
          actions: { annotation: { onScrollToHighlight: (annotationId: string) => void } };
          article: { extracted: { title: string } };
          toolbar: { controls: React.ReactNode };
        };
      }
    | undefined,
  view: null as unknown,
  pageInfo: null as { sectionIndex: number; pageIndex: number; pageCount: number } | null,
  sectionPageCounts: [] as Array<number | null>,
  foliateViewInput: undefined as
    | { onBeforePageTurn: (trace: EbookPageTurnTrace) => void }
    | undefined,
}));

vi.mock('../source/ebook/app-source-ebook-reader-shell', () => ({
  EbookReaderShell: (props: {
    readerApp: {
      actions: { annotation: { onScrollToHighlight: (annotationId: string) => void } };
      article: { extracted: { title: string } };
      toolbar: { controls: React.ReactNode };
    };
  }) => {
    mocks.readerShellProps = props;
    return (
      <div data-testid="ebook-reader-shell">
        {props.readerApp.article.extracted.title}
        {props.readerApp.toolbar.controls}
      </div>
    );
  },
}));

vi.mock('../source/ebook/use-ebook-foliate-view', () => ({
  useEbookFoliateView: (input: { onBeforePageTurn: (trace: EbookPageTurnTrace) => void }) => {
    mocks.foliateViewInput = input;
    return {
      viewHostRef: { current: null },
      measureHostRef: { current: null },
      viewRef: { current: mocks.view },
      pageInfoSectionIndexRef: { current: undefined },
      paginationLayoutKeyRef: { current: '' },
      readerSettingsRef: {
        current: { fontSize: 18, contentWidth: 720, backgroundColor: '#fffdf8' },
      },
      readerStateStatusRef: { current: 'ready' },
      tocItems: [],
      sectionFractions: [],
      pageInfo: mocks.pageInfo,
      sectionPageCounts: mocks.sectionPageCounts,
      progress: 0,
      readerState: { status: 'ready', message: '' },
      goLeft: mocks.goLeft,
      goRight: mocks.goRight,
      goToProgress: mocks.goToProgress,
      goToTocItem: mocks.goToTocItem,
    };
  },
}));

vi.mock('../source/ebook/use-ebook-reader-boxes', () => ({
  useEbookReaderBoxes: () => ({
    boxes: mocks.boxes,
    attachFoliateDocumentListeners: mocks.attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners: mocks.cleanupFoliateDocumentListeners,
    hideEbookBoxLayer: mocks.hideEbookBoxLayer,
    resetEbookBoxState: mocks.resetEbookBoxState,
    scheduleEbookBoxUpdate: mocks.scheduleEbookBoxUpdate,
  }),
}));

vi.mock('../source/ebook/use-ebook-agent-virtual-reading', () => ({
  useEbookAgentVirtualReading: () => ({
    agentDockCompleting: false,
    agentDockItems: [],
    agentTheaterBoxes: [],
    completionBurstKey: 0,
    virtualCursors: [],
    agentAnimationQueueRef: { current: Promise.resolve() },
    cleanupAgentTheater: mocks.cleanupAgentTheater,
    cursorAgent: vi.fn(),
    finishAgentDock: vi.fn(),
    finishVirtualReading: vi.fn(),
    setAgentTheaterBoxes: mocks.setAgentTheaterBoxes,
    startAgentDock: vi.fn(),
    startVirtualReading: vi.fn(),
    stopVirtualReadingTimer: vi.fn(),
    updateVirtualCursor: vi.fn(),
  }),
}));

const now = '2026-05-16T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.boxes = [];
  mocks.readerShellProps = undefined;
  mocks.view = null;
  mocks.pageInfo = null;
  mocks.sectionPageCounts = [];
  mocks.foliateViewInput = undefined;
});

function annotation(id: string): Annotation {
  return {
    id,
    anchor: {
      exact: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
      chapterId: 'chapter-1',
      textStartInBook: 10,
      textEndInBook: 18,
    },
    author: 'user',
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function ebookArticle(overrides: Partial<EbookArticleRecord> = {}): EbookArticleRecord {
  return {
    id: 'ebook-1',
    url: 'file://book.epub',
    canonicalUrl: 'file://book.epub',
    sourceType: 'ebook',
    title: '电子书',
    byline: '',
    siteName: '',
    contentHtml: '',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1024,
      },
      chapters: [
        {
          id: 'chapter-1',
          title: '第一章',
          html: '<p>正文</p>',
          textLength: 2,
        },
      ],
      index: {
        version: 1,
        articleId: 'ebook-1',
        textLength: 100,
        chapters: [
          {
            id: 'chapter-1',
            title: '第一章',
            indexInBook: 0,
            textStart: 0,
            textEnd: 100,
            textLength: 100,
            previewStart: '',
            previewEnd: '',
            segmentIds: [],
            paragraphIds: [],
          },
        ],
        segments: [],
        paragraphs: [],
      },
    },
    ...overrides,
  };
}

function renderEbookBookcase(sourceArticle: EbookArticleRecord, annotations: Annotation[]) {
  return render(
    <EbookBookcase
      agents={[]}
      annotations={annotations}
      article={sourceArticle}
      focusAnnotationId={null}
      readerTheme={defaultTheme.reader}
      selectedAnnotationId={null}
      uiLanguage="zh-CN"
      userProfile={userProfile}
      onClose={vi.fn()}
      onFocusedAnnotation={vi.fn()}
      onOpenAnnotation={vi.fn()}
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={vi.fn()}
      onUpdateArticle={vi.fn()}
    />,
  );
}

describe('EbookBookcase', () => {
  it('does not reset ebook boxes when the same article only updates reading progress', () => {
    const annotations = [annotation('note-1')];
    const article = ebookArticle({ annotations });
    const { rerender } = renderEbookBookcase(article, annotations);

    expect(mocks.resetEbookBoxState).toHaveBeenCalledTimes(1);

    const progressArticle = ebookArticle({
      annotations: [...annotations],
      readingProgress: {
        pageIndex: 2,
        pageCount: 10,
        progress: 0.2,
        updatedAt: now,
      },
      updatedAt: '2026-05-16T08:00:01.000Z',
    });

    rerender(
      <EbookBookcase
        agents={[]}
        annotations={progressArticle.annotations}
        article={progressArticle}
        focusAnnotationId={null}
        readerTheme={defaultTheme.reader}
        selectedAnnotationId={null}
        uiLanguage="zh-CN"
        userProfile={userProfile}
        onClose={vi.fn()}
        onFocusedAnnotation={vi.fn()}
        onOpenAnnotation={vi.fn()}
        onSaveArticle={vi.fn()}
        onSaveArticleReadingProgress={vi.fn()}
        onUpdateArticle={vi.fn()}
      />,
    );

    expect(mocks.resetEbookBoxState).toHaveBeenCalledTimes(1);
  });

  it('clears ebook page overlays before a page turn', () => {
    renderEbookBookcase(ebookArticle(), []);

    expect(mocks.resetEbookBoxState).toHaveBeenCalledTimes(1);
    act(() => {
      mocks.foliateViewInput?.onBeforePageTurn({
        articleId: 'ebook-1',
        direction: 'right',
        source: 'control',
        startedAt: performance.now(),
        turnId: 'test-turn',
      });
    });

    expect(mocks.resetEbookBoxState).toHaveBeenCalledTimes(1);
    expect(mocks.hideEbookBoxLayer).toHaveBeenCalledTimes(1);
  });

  it('keeps EPUB page controls enabled while full pagination is still pending', () => {
    mocks.pageInfo = { sectionIndex: 1, pageIndex: 2, pageCount: 5 };
    mocks.sectionPageCounts = [null, 5, null];

    const { container } = renderEbookBookcase(ebookArticle(), []);

    const previousButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="readerControls.previousPage"]',
    );
    const nextButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="readerControls.nextPage"]',
    );
    expect(previousButton?.disabled).toBe(false);
    expect(nextButton?.disabled).toBe(false);
    const controls = container.querySelector('.reader-floating-control-group');
    expect(controls?.classList.contains('is-paginating')).toBe(true);
    expect(container.textContent).not.toContain('3 / 5');
  });

  it('shows the final EPUB page label after full pagination is complete', () => {
    mocks.pageInfo = { sectionIndex: 1, pageIndex: 2, pageCount: 5 };
    mocks.sectionPageCounts = [10, 5, 20];

    const { container } = renderEbookBookcase(ebookArticle(), []);

    const controls = container.querySelector('.reader-floating-control-group');
    expect(controls?.classList.contains('is-paginating')).toBe(false);
    expect(container.textContent).toContain('13 / 35');
  });

  it('selects visible page annotations without re-navigating foliate', () => {
    const annotations = [annotation('note-1')];
    const goToFraction = vi.fn();
    mocks.view = {
      book: { sections: [] },
      goToFraction,
    };
    mocks.boxes = [
      {
        id: 'box-1',
        annotationId: 'note-1',
        color: '#f4c95d',
        top: 10,
        left: 10,
        width: 40,
        height: 12,
      },
    ];
    const onOpenAnnotation = vi.fn();

    render(
      <EbookBookcase
        agents={[]}
        annotations={annotations}
        article={ebookArticle({ annotations })}
        focusAnnotationId={null}
        readerTheme={defaultTheme.reader}
        selectedAnnotationId={null}
        uiLanguage="zh-CN"
        userProfile={userProfile}
        onClose={vi.fn()}
        onFocusedAnnotation={vi.fn()}
        onOpenAnnotation={onOpenAnnotation}
        onSaveArticle={vi.fn()}
        onSaveArticleReadingProgress={vi.fn()}
        onUpdateArticle={vi.fn()}
      />,
    );

    act(() => {
      mocks.readerShellProps?.readerApp.actions.annotation.onScrollToHighlight('note-1');
    });

    expect(onOpenAnnotation).toHaveBeenCalledWith('note-1');
    expect(goToFraction).not.toHaveBeenCalled();
  });

  it('consumes focused annotations once when the reader rerenders during navigation', async () => {
    const note = annotation('note-1');
    const doc = document.implementation.createHTMLDocument('ebook');
    doc.body.innerHTML = '<p>quote note-1</p>';
    let resolveScrollToAnchor: (() => void) | null = null;
    const scrollToAnchor = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveScrollToAnchor = resolve;
        }),
    );
    mocks.view = {
      book: { sections: [{ id: 'chapter-1' }] },
      getPageInfo: () => ({ sectionIndex: 0, pageIndex: 0, pageCount: 1 }),
      goTo: vi.fn().mockResolvedValue(undefined),
      goToFraction: vi.fn().mockResolvedValue(undefined),
      renderer: {
        getContents: () => [{ doc, index: 0 }],
        scrollToAnchor,
      },
    };

    const firstFocused = vi.fn();
    const latestFocused = vi.fn();
    const view = render(
      <EbookBookcase
        agents={[]}
        annotations={[note]}
        article={ebookArticle({ annotations: [note] })}
        focusAnnotationId="note-1"
        readerTheme={defaultTheme.reader}
        selectedAnnotationId={null}
        uiLanguage="zh-CN"
        userProfile={userProfile}
        onClose={vi.fn()}
        onFocusedAnnotation={firstFocused}
        onOpenAnnotation={vi.fn()}
        onSaveArticle={vi.fn()}
        onSaveArticleReadingProgress={vi.fn()}
        onUpdateArticle={vi.fn()}
      />,
    );

    await waitFor(() => expect(scrollToAnchor).toHaveBeenCalledTimes(1));

    view.rerender(
      <EbookBookcase
        agents={[]}
        annotations={[note]}
        article={ebookArticle({ annotations: [note] })}
        focusAnnotationId="note-1"
        readerTheme={defaultTheme.reader}
        selectedAnnotationId={null}
        uiLanguage="zh-CN"
        userProfile={userProfile}
        onClose={vi.fn()}
        onFocusedAnnotation={latestFocused}
        onOpenAnnotation={vi.fn()}
        onSaveArticle={vi.fn()}
        onSaveArticleReadingProgress={vi.fn()}
        onUpdateArticle={vi.fn()}
      />,
    );
    expect(scrollToAnchor).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveScrollToAnchor?.();
    });

    await waitFor(() => expect(latestFocused).toHaveBeenCalledTimes(1));
    expect(scrollToAnchor).toHaveBeenCalledTimes(1);
    expect(firstFocused).not.toHaveBeenCalled();
  });
});
