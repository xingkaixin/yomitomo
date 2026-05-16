// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import type { EbookPageTurnTrace } from '../app-ebook-reader-utils';
import { EbookBookcase } from '../app-source-bookcase-ebook';
import type { EbookArticleRecord } from '../app-source-bookcase-shared';

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
  foliateViewInput: undefined as
    | { onBeforePageTurn: (trace: EbookPageTurnTrace) => void }
    | undefined,
}));

vi.mock('../app-source-ebook-reader-shell', () => ({
  EbookReaderShell: ({ extracted }: { extracted: { title: string } }) => (
    <div data-testid="ebook-reader-shell">{extracted.title}</div>
  ),
}));

vi.mock('../use-ebook-foliate-view', () => ({
  useEbookFoliateView: (input: { onBeforePageTurn: (trace: EbookPageTurnTrace) => void }) => {
    mocks.foliateViewInput = input;
    return {
      viewHostRef: { current: null },
      measureHostRef: { current: null },
      viewRef: { current: null },
      pageInfoSectionIndexRef: { current: undefined },
      paginationLayoutKeyRef: { current: '' },
      readerSettingsRef: { current: { fontSize: 18, contentWidth: 720 } },
      readerStateStatusRef: { current: 'ready' },
      tocItems: [],
      sectionFractions: [],
      pageInfo: null,
      sectionPageCounts: [],
      progress: 0,
      readerState: { status: 'ready', message: '' },
      goLeft: mocks.goLeft,
      goRight: mocks.goRight,
      goToProgress: mocks.goToProgress,
      goToTocItem: mocks.goToTocItem,
    };
  },
}));

vi.mock('../use-ebook-reader-boxes', () => ({
  useEbookReaderBoxes: () => ({
    boxes: [],
    attachFoliateDocumentListeners: mocks.attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners: mocks.cleanupFoliateDocumentListeners,
    hideEbookBoxLayer: mocks.hideEbookBoxLayer,
    resetEbookBoxState: mocks.resetEbookBoxState,
    scheduleEbookBoxUpdate: mocks.scheduleEbookBoxUpdate,
  }),
}));

vi.mock('../use-ebook-agent-virtual-reading', () => ({
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
  vi.clearAllMocks();
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
      selectedAnnotationId={null}
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
        selectedAnnotationId={null}
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
});
