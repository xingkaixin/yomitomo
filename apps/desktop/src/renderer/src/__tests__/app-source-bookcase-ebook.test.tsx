// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type { EbookPageTurnTrace } from '../source/ebook/ebook-foliate-view';
import { EbookBookcase } from '../source/ebook/app-source-bookcase-ebook';
import type {
  EbookArticleRecord,
  EbookBookcaseProps,
} from '../source/bookcase/app-source-bookcase';
import { lightTheme } from '../theme/app-theme';
import { createDesktopStore, DesktopStoreProvider } from '../shell/app-desktop-store';
import { articleActionStubs } from './article-actions-test-utils';

const mocks = vi.hoisted(() => ({
  attachFoliateDocumentListeners: vi.fn(),
  cleanupFoliateDocumentListeners: vi.fn(),
  goLeft: vi.fn(),
  goRight: vi.fn(),
  goToProgress: vi.fn(),
  goToTocItem: vi.fn(),
  hideEbookBoxLayer: vi.fn(),
  scheduleEbookBoxUpdate: vi.fn(),
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
  viewRef: { current: null } as { current: unknown },
  openSettled: true,
  pageInfo: null as { sectionIndex: number; pageIndex: number; pageCount: number } | null,
  sectionPageCounts: [] as Array<number | null>,
  foliateViewInput: undefined as
    | { onBeforePageTurn: (trace: EbookPageTurnTrace) => void }
    | undefined,
  foliateInputBridgeInput: undefined as
    | {
        canvasRef: { current: HTMLDivElement | null };
        onFoliatePointerDown: (event?: PointerEvent, doc?: Document) => void;
      }
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
    mocks.viewRef.current = mocks.view;
    return {
      viewHostRef: { current: null },
      measureHostRef: { current: null },
      viewRef: mocks.viewRef,
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
      openSettled: mocks.openSettled,
      goLeft: mocks.goLeft,
      goRight: mocks.goRight,
      goToProgress: mocks.goToProgress,
      goToTocItem: mocks.goToTocItem,
      markers: [],
    };
  },
}));

vi.mock('../source/ebook/use-ebook-reader-boxes', () => ({
  useEbookReaderBoxes: () => ({
    boxes: mocks.boxes,
    hideEbookBoxLayer: mocks.hideEbookBoxLayer,
    markers: [],
    scheduleEbookBoxUpdate: mocks.scheduleEbookBoxUpdate,
  }),
}));

vi.mock('../source/ebook/use-foliate-input-bridge', () => ({
  useFoliateInputBridge: (input: typeof mocks.foliateInputBridgeInput) => {
    mocks.foliateInputBridgeInput = input;
    return {
      attachFoliateDocumentListeners: mocks.attachFoliateDocumentListeners,
      cleanupFoliateDocumentListeners: mocks.cleanupFoliateDocumentListeners,
      marker: null,
    };
  },
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
  mocks.boxes = [];
  mocks.readerShellProps = undefined;
  mocks.view = null;
  mocks.openSettled = true;
  mocks.pageInfo = null;
  mocks.sectionPageCounts = [];
  mocks.foliateViewInput = undefined;
  mocks.foliateInputBridgeInput = undefined;
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
    author: {
      kind: 'user',
      userId: userProfile.id,
      username: userProfile.username,
      nickname: userProfile.nickname,
    },
    annotationType: 'key_point',
    color: userProfile.annotationColor,
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
  const store = createDesktopStore();
  return render(<EbookBookcase {...ebookBookcaseProps(sourceArticle, annotations)} />, {
    wrapper: ({ children }) => (
      <DesktopStoreProvider store={store}>{children}</DesktopStoreProvider>
    ),
  });
}

describe('EbookBookcase', () => {
  it('keeps the reader mounted when the same article only updates reading progress', () => {
    const annotations = [annotation('note-1')];
    const article = ebookArticle({ annotations });
    const { getByTestId, rerender } = renderEbookBookcase(article, annotations);
    const readerShell = getByTestId('ebook-reader-shell');

    const progressArticle = ebookArticle({
      annotations: [...annotations],
      readingProgress: {
        kind: 'chapter',
        chapterIndex: 1,
        chapterProgress: 0.2,
        bookProgress: 0.2,
        updatedAt: now,
      },
      updatedAt: '2026-05-16T08:00:01.000Z',
    });

    rerender(
      <EbookBookcase {...ebookBookcaseProps(progressArticle, progressArticle.annotations)} />,
    );

    expect(getByTestId('ebook-reader-shell')).toBe(readerShell);

    const otherArticle = ebookArticle({ id: 'ebook-2' });
    rerender(<EbookBookcase {...ebookBookcaseProps(otherArticle, [])} />);

    expect(getByTestId('ebook-reader-shell')).not.toBe(readerShell);
  });
});

function ebookBookcaseProps(
  sourceArticle: EbookArticleRecord,
  annotations: Annotation[],
): EbookBookcaseProps {
  return {
    annotationActions: {
      onArticleChange: vi.fn(),
      onFocusedAnnotation: vi.fn(),
      onOpenAnnotation: vi.fn(),
    },
    articleActions: articleActionStubs(),
    content: {
      agents: [],
      annotations,
      article: sourceArticle,
      userProfile,
    },
    presentation: {
      readerTheme: lightTheme.reader,
      uiLanguage: 'zh-CN',
    },
    readerControl: {
      focusAnnotationId: null,
      onClose: vi.fn(),
      selectedAnnotationId: null,
    },
  };
}
