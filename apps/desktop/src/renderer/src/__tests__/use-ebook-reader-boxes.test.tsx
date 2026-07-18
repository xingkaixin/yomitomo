// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { useEbookReaderBoxes } from '../source/ebook/use-ebook-reader-boxes';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase';
import type { FoliateViewElement } from '../source/ebook/app-ebook-reader-utils';

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
  Reflect.deleteProperty(window, 'yomitomoEbookLayoutDebug');
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
const onFoliateClick = vi.fn();
const onFoliatePointerDown = vi.fn();
const onFoliatePageTurnClick = vi.fn();
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
    onFoliateClick,
    onFoliatePointerDown,
    onFoliatePageTurnClick,
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

  it('turns pages from foliate document clicks in the edge hot zones', () => {
    const doc = foliateDocument('正文');
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 20 }));
    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 780 }));

    expect(onFoliateClick).toHaveBeenCalledTimes(2);
    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(1, 'left');
    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(2, 'right');
  });

  it('does not turn pages when the foliate document has an expanded selection', () => {
    const doc = foliateDocument('正文');
    vi.spyOn(doc, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
    } as Selection);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 20 }));

    expect(onFoliateClick).not.toHaveBeenCalled();
    expect(onFoliatePageTurnClick).not.toHaveBeenCalled();
  });

  it('does not bridge foliate double-click selections to the reader menu', async () => {
    const doc = foliateDocument('正文');
    const removeAllRanges = vi.fn();
    vi.spyOn(doc, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges,
    } as unknown as Selection);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    const mouseDown = foliateMouseEvent('mousedown', { clientX: 20, detail: 2 });
    doc.body.dispatchEvent(mouseDown);
    doc.body.dispatchEvent(foliateMouseEvent('mouseup', { clientX: 20 }));

    await waitForFoliateSelection();

    expect(onFoliateSelection).not.toHaveBeenCalled();
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('keeps foliate drag selections bridged from normal mouseup', async () => {
    const doc = foliateDocument('正文');
    vi.spyOn(doc, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
    } as Selection);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    doc.body.dispatchEvent(foliateMouseEvent('mouseup', { clientX: 20 }));

    await waitForFoliateSelection();

    expect(onFoliateSelection).toHaveBeenCalledWith(doc);
  });

  it('does not let stale foliate double-click suppression block the next selection', async () => {
    const doc = foliateDocument('正文');
    vi.spyOn(doc, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges: vi.fn(),
    } as unknown as Selection);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    doc.body.dispatchEvent(foliateMouseEvent('mousedown', { clientX: 20, detail: 2 }));
    doc.body.dispatchEvent(foliateMouseEvent('mousedown', { clientX: 20, detail: 1 }));
    doc.body.dispatchEvent(foliateMouseEvent('mouseup', { clientX: 20 }));

    await waitForFoliateSelection();

    expect(onFoliateSelection).toHaveBeenCalledWith(doc);
  });

  it('does not suppress foliate double clicks on interactive targets', () => {
    const doc = foliateDocument('');
    const button = doc.createElement('button');
    button.textContent = 'Action';
    doc.body.append(button);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    const mouseDown = foliateMouseEvent('mousedown', { clientX: 20, detail: 2 });
    button.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(false);
  });

  it('does not turn pages when a highlight click is handled first', () => {
    const doc = foliateDocument('正文');
    onFoliateClick.mockReturnValueOnce(true);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 20 }));

    expect(onFoliateClick).toHaveBeenCalledTimes(1);
    expect(onFoliatePageTurnClick).not.toHaveBeenCalled();
  });

  it('does not turn pages from interactive foliate targets', () => {
    const doc = foliateDocument('');
    const button = doc.createElement('button');
    button.textContent = 'Action';
    doc.body.append(button);
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    button.dispatchEvent(foliateMouseEvent('click', { clientX: 20 }));

    expect(onFoliateClick).toHaveBeenCalledTimes(1);
    expect(onFoliatePageTurnClick).not.toHaveBeenCalled();
  });

  it('attaches foliate listeners to every current content document', () => {
    const firstDoc = foliateDocument('第一页');
    const secondDoc = foliateDocument('第二页');
    render(<EbookBoxesProbe view={foliateView([firstDoc, secondDoc])} />);

    secondDoc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 780 }));

    expect(onFoliateClick).toHaveBeenCalledTimes(1);
    expect(onFoliatePageTurnClick).toHaveBeenCalledWith('right');
  });

  it('sets a non-intercepting hover direction on the reader canvas', () => {
    const doc = foliateDocument('正文');
    render(<EbookBoxesProbe view={foliateView(doc)} />);

    const canvas = screen.getByTestId('canvas');
    doc.body.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 20 }));
    expect(canvas.dataset.ebookClickPagingHover).toBe('left');

    doc.body.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 400 }));
    expect(canvas.dataset.ebookClickPagingHover).toBeUndefined();
  });

  it('uses the visible foliate view for hit testing when the iframe is expanded', () => {
    const doc = foliateDocument('正文', { left: -600, width: 2000 });
    const view = foliateView(doc, { left: 0, width: 800 });
    render(<EbookBoxesProbe view={view} />);

    const canvas = screen.getByTestId('canvas');
    doc.body.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 620 }));
    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 620 }));
    expect(canvas.dataset.ebookClickPagingHover).toBe('left');

    doc.body.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 1380 }));
    doc.body.dispatchEvent(foliateMouseEvent('click', { clientX: 1380 }));
    expect(canvas.dataset.ebookClickPagingHover).toBe('right');

    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(1, 'left');
    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(2, 'right');
  });

  it('turns pages from visible foliate view clicks outside iframe documents', () => {
    const doc = foliateDocument('正文', { left: 0, width: 800 });
    const view = foliateView(doc, { left: 0, width: 800 });
    render(<EbookBoxesProbe view={view} />);

    const canvas = screen.getByTestId('canvas');
    view.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 20 }));
    view.dispatchEvent(foliateMouseEvent('click', { clientX: 20 }));
    expect(canvas.dataset.ebookClickPagingHover).toBe('left');

    view.dispatchEvent(foliateMouseEvent('mousemove', { clientX: 780 }));
    view.dispatchEvent(foliateMouseEvent('click', { clientX: 780 }));
    expect(canvas.dataset.ebookClickPagingHover).toBe('right');

    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(1, 'left');
    expect(onFoliatePageTurnClick).toHaveBeenNthCalledWith(2, 'right');
  });
});

function foliateDocument(
  text: string,
  rect: { left: number; width: number } = { left: 0, width: 800 },
) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  frame.getBoundingClientRect = () =>
    ({
      bottom: 1000,
      height: 1000,
      left: rect.left,
      right: rect.left + rect.width,
      top: 0,
      width: rect.width,
      x: rect.left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const doc = frame.contentDocument!;
  doc.body.textContent = text;
  return doc;
}

function foliateMouseEvent(
  type: string,
  { clientX, detail = 1 }: { clientX: number; detail?: number },
) {
  return new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY: 12,
    detail,
  });
}

function waitForFoliateSelection() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function foliateView(
  docs: Document | Document[],
  rect: { left: number; width: number } = { left: 0, width: 800 },
) {
  const contents = (Array.isArray(docs) ? docs : [docs]).map((doc, index) => ({ doc, index }));
  const renderer = document.createElement('div') as unknown as HTMLElement & {
    getContents: () => Array<{ doc: Document; index: number }>;
  };
  renderer.getContents = () => contents;
  const view = document.createElement('div');
  view.getBoundingClientRect = () =>
    ({
      bottom: 1000,
      height: 1000,
      left: rect.left,
      right: rect.left + rect.width,
      top: 0,
      width: rect.width,
      x: rect.left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return Object.assign(view, {
    renderer,
    getPageInfo: () => ({ sectionIndex: 0, pageIndex: 0, pageCount: 1 }),
  }) as unknown as FoliateViewElement;
}
