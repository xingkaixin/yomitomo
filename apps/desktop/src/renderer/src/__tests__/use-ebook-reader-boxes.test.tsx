// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { useEbookReaderBoxes } from '../use-ebook-reader-boxes';
import type { EbookArticleRecord } from '../app-source-bookcase-shared';
import type { FoliateViewElement } from '../app-ebook-reader-utils';

const now = '2026-05-16T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

type EbookReaderBoxesState = ReturnType<typeof useEbookReaderBoxes>;

let latestBoxesState: EbookReaderBoxesState | null = null;

afterEach(() => {
  latestBoxesState = null;
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

function ebookArticle(): EbookArticleRecord {
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
      chapters: [],
    },
  };
}

const article = ebookArticle();
const annotationAgents: PublicAgent[] = [];
const onFoliatePointerDown = vi.fn();
const onFoliatePageTurnKey = vi.fn();
const onFoliateSelection = vi.fn();
const onFoliateSelectionShortcut = vi.fn();

function annotation(id: string, exact: string): Annotation {
  return {
    id,
    anchor: { exact, prefix: '', suffix: '', start: 0, end: exact.length },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function requireBoxesState() {
  if (!latestBoxesState) throw new Error('ebook reader boxes not rendered');
  return latestBoxesState;
}

function EbookBoxesProbe({
  annotations = [],
  view = null,
}: {
  annotations?: Annotation[];
  view?: FoliateViewElement | null;
}) {
  const annotationsRef = React.useRef<Annotation[]>(annotations);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<FoliateViewElement | null>(view);
  const pageTurnTraceRef = React.useRef(null);
  const pageInfoSectionIndexRef = React.useRef<number | undefined>(undefined);
  const paginationLayoutKeyRef = React.useRef('');
  const readerSettingsRef = React.useRef({
    fontSize: 18,
    contentWidth: 720,
    backgroundColor: '#fffdf8',
  });
  const readerStateStatusRef = React.useRef<'loading' | 'ready' | 'error'>('ready');
  annotationsRef.current = annotations;
  viewRef.current = view;

  latestBoxesState = useEbookReaderBoxes({
    annotationAgents,
    annotationsRef,
    article,
    canvasRef,
    viewRef,
    pageTurnTraceRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatus: 'ready',
    readerStateStatusRef,
    userProfile,
    onFoliatePointerDown,
    onFoliatePageTurnKey,
    onFoliateSelection,
    onFoliateSelectionShortcut,
  });

  return <div data-testid="canvas" ref={canvasRef} />;
}

describe('useEbookReaderBoxes', () => {
  it('hides the highlight layer immediately during page turns', () => {
    render(<EbookBoxesProbe />);

    const canvas = screen.getByTestId('canvas');
    act(() => {
      requireBoxesState().hideEbookBoxLayer();
    });

    expect(canvas.classList.contains('is-ebook-page-turning')).toBe(true);

    act(() => {
      requireBoxesState().resetEbookBoxState();
    });

    expect(canvas.classList.contains('is-ebook-page-turning')).toBe(false);
  });

  it('reuses one DOM text index for multiple annotation lookups in the same update', () => {
    const recordPerformanceTiming = vi.fn();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { recordPerformanceTiming },
    });
    const doc = foliateDocument('Alpha quote. Beta quote.');

    render(
      <EbookBoxesProbe
        annotations={[annotation('annotation_1', 'Alpha'), annotation('annotation_2', 'Beta')]}
        view={foliateView(doc)}
      />,
    );

    const timing = recordPerformanceTiming.mock.calls.find(
      ([payload]) => payload.event === 'reader_highlight_boxes',
    )?.[0];
    expect(timing?.data).toMatchObject({
      result: 'updated',
      anchorLookupCount: 2,
      resolvedAnchorCount: 2,
      domTextIndexBuildCount: 1,
    });
  });

  it('bridges foliate document arrow keys to page turns after selection shortcuts', () => {
    const doc = foliateDocument('正文');
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    act(() => {
      requireBoxesState().attachFoliateDocumentListeners(foliateView(doc));
    });

    doc.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }),
    );

    expect(onFoliateSelectionShortcut).toHaveBeenCalledTimes(1);
    expect(onFoliatePageTurnKey).toHaveBeenCalledWith('right');
  });

  it('does not bridge foliate arrow keys when a selection shortcut handles the event', () => {
    const doc = foliateDocument('正文');
    onFoliateSelectionShortcut.mockImplementationOnce((event: KeyboardEvent) => {
      event.preventDefault();
    });
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    act(() => {
      requireBoxesState().attachFoliateDocumentListeners(foliateView(doc));
    });

    doc.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft' }),
    );

    expect(onFoliateSelectionShortcut).toHaveBeenCalledTimes(1);
    expect(onFoliatePageTurnKey).not.toHaveBeenCalled();
  });
});

function foliateDocument(text: string) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.textContent = text;
  return doc;
}

function foliateView(doc: Document) {
  const renderer = document.createElement('div') as unknown as HTMLElement & {
    getContents: () => Array<{ doc: Document; index: number }>;
  };
  renderer.getContents = () => [{ doc, index: 0 }];
  return Object.assign(document.createElement('div'), {
    renderer,
    getPageInfo: () => ({ sectionIndex: 0, pageIndex: 0, pageCount: 1 }),
  }) as unknown as FoliateViewElement;
}
