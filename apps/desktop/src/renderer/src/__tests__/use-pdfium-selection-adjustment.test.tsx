// @vitest-environment jsdom

import { useRef, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import type { PdfPageGeometry } from '@embedpdf/models';
import { createPdfTextAnchor } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type {
  SelectionAction,
  SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageMetric } from '../source/pdfium/app-source-bookcase-pdfium-utils';
import { usePdfiumSelectionAdjustment } from '../source/pdfium/use-pdfium-selection-adjustment';

type HookState = ReturnType<typeof usePdfiumSelectionAdjustment>;
type HookOptions = Parameters<typeof usePdfiumSelectionAdjustment>[0];
type PdfiumLoadedDocument = NonNullable<HookOptions['document']>;

type HarnessControls = HookState & {
  selectionAction: SelectionAction | null;
  temporaryBoxes: HighlightBox[];
};

const pageMetric: PageMetric = {
  left: 20,
  top: 30,
  width: 200,
  height: 100,
  clipLeft: 20,
  clipTop: 30,
  clipRight: 220,
  clipBottom: 130,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function flushMicrotasks() {
  return Promise.resolve();
}

function createDocument(): PdfiumLoadedDocument {
  return {
    pages: [{ size: { height: 100, width: 50 } }],
  } as PdfiumLoadedDocument;
}

function glyphGeometry(length: number) {
  return {
    runs: [
      {
        charStart: 0,
        glyphs: Array.from({ length }, (_, index) => ({
          x: index * 10,
          y: 20,
          width: 10,
          height: 10,
          flags: 0,
        })),
      },
    ],
  } as unknown as PdfPageGeometry;
}

function pdfAnchor(start = 1, end = 3) {
  return createPdfTextAnchor({
    pageText: 'abcde',
    pageIndex: 0,
    pageWidth: 50,
    pageHeight: 100,
    start,
    end,
    rects: [{ x: start / 5, y: 0.2, width: (end - start) / 5, height: 0.1 }],
  });
}

function pointer(clientX: number, handle: SelectionAdjustmentPointer['handle'] = 'end') {
  return {
    clientX,
    clientY: 200 + pageMetric.top + 25,
    handle,
  };
}

function renderHarness({
  articleId = 'article_1',
  canvas = true,
  document = createDocument(),
  engine = createEngine(),
  extractPageText = vi.fn(() => Promise.resolve('abcde')),
  metrics = { 0: pageMetric },
  selectionAction = {
    x: 0,
    y: 0,
    anchor: pdfAnchor(),
    adjustable: true,
  },
}: Partial<HookOptions> & {
  canvas?: boolean;
  metrics?: Record<number, PageMetric>;
} = {}) {
  let controls: HarnessControls | null = null;

  type HarnessProps = {
    articleId: string;
    document: PdfiumLoadedDocument | undefined;
    metrics: Record<number, PageMetric>;
    selectionAction: SelectionAction | null;
  };

  function Harness(props: HarnessProps) {
    const [currentSelectionAction, setSelectionAction] = useState(props.selectionAction);
    const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const pageMetricsRef = useRef(props.metrics);
    pageMetricsRef.current = props.metrics;
    const state = usePdfiumSelectionAdjustment({
      articleId: props.articleId,
      canvasRef,
      contributorId: 'user_1',
      document: props.document,
      engine,
      extractPageText,
      pageMetricsRef,
      selectionAction: currentSelectionAction,
      setSelectionAction,
      setTemporaryBoxes,
    });
    controls = { ...state, selectionAction: currentSelectionAction, temporaryBoxes };
    return canvas ? (
      <div ref={canvasRef} data-testid="canvas" style={{ height: 200, width: 400 }} />
    ) : null;
  }

  const view = render(
    <Harness
      articleId={articleId}
      document={document}
      metrics={metrics}
      selectionAction={selectionAction}
    />,
  );
  function mockCanvasRect() {
    const canvasElement = view.queryByTestId('canvas');
    if (!canvasElement) return;
    vi.spyOn(canvasElement, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 400,
      height: 200,
      right: 500,
      bottom: 400,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
  }
  mockCanvasRect();

  return {
    ...view,
    controls: () => {
      if (!controls) throw new Error('PDFium selection adjustment hook did not render');
      return controls;
    },
    rerenderHarness: (props: Partial<HarnessProps>) => {
      view.rerender(
        <Harness
          articleId={props.articleId ?? articleId}
          document={props.document ?? document}
          metrics={props.metrics ?? metrics}
          selectionAction={props.selectionAction ?? selectionAction}
        />,
      );
      mockCanvasRect();
    },
  };
}

function createEngine(geometry = glyphGeometry(5)) {
  return {
    getPageGeometry: vi.fn(() => ({
      toPromise: () => Promise.resolve(geometry),
    })),
  } as unknown as HookOptions['engine'];
}

describe('usePdfiumSelectionAdjustment', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('updates selection action and temporary boxes, then clears dragging handle on finish', async () => {
    const view = renderHarness();

    act(() => {
      view.controls().startPdfiumSelectionAdjustment(pointer(220));
    });
    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      view.controls().updatePdfiumSelectionAdjustment(pointer(300));
    });

    expect(view.controls().selectionAction?.anchor).toMatchObject({
      kind: 'pdf-text',
      start: 1,
      end: 4,
    });
    expect(view.controls().selectionAction?.draggingHandle).toBe('end');
    expect(view.controls().temporaryBoxes).toHaveLength(1);
    expect(view.controls().temporaryBoxes[0]).toMatchObject({
      annotationId: 'pdfium-selection',
      contributorId: 'user_1',
    });

    act(() => {
      view.controls().finishPdfiumSelectionAdjustment(pointer(300));
    });

    expect(view.controls().selectionAction?.draggingHandle).toBeUndefined();
  });

  it('switches the dragging handle after crossing the fixed selection edge', async () => {
    const view = renderHarness();

    act(() => {
      view.controls().startPdfiumSelectionAdjustment(pointer(220, 'end'));
    });
    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      view.controls().updatePdfiumSelectionAdjustment(pointer(122, 'end'));
    });

    expect(view.controls().selectionAction?.anchor).toMatchObject({
      kind: 'pdf-text',
      start: 0,
      end: 1,
    });
    expect(view.controls().selectionAction?.draggingHandle).toBe('start');
  });

  it('reuses cached geometry and page text source', async () => {
    const engine = createEngine();
    const extractPageText = vi.fn(() => Promise.resolve('abcde'));
    const view = renderHarness({ engine, extractPageText });

    await act(async () => {
      await view.controls().preparePdfiumSelectionAdjustmentSource(0);
      await view.controls().preparePdfiumSelectionAdjustmentSource(0);
    });

    act(() => {
      view.controls().startPdfiumSelectionAdjustment(pointer(220));
    });

    expect(engine.getPageGeometry).toHaveBeenCalledTimes(1);
    expect(extractPageText).toHaveBeenCalledTimes(1);
  });

  it('does not let stale async prepare results populate the next request cache', async () => {
    const deferred = createDeferred<string>();
    const engine = createEngine();
    const extractPageText = vi
      .fn<HookOptions['extractPageText']>()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValue('abcde');
    const view = renderHarness({ engine, extractPageText });

    void view.controls().preparePdfiumSelectionAdjustmentSource(0);
    view.rerenderHarness({ articleId: 'article_2', document: createDocument() });

    await act(async () => {
      deferred.resolve('stale');
      await flushMicrotasks();
    });

    await act(async () => {
      await view.controls().preparePdfiumSelectionAdjustmentSource(0);
    });

    expect(engine.getPageGeometry).toHaveBeenCalledTimes(2);
    expect(extractPageText).toHaveBeenCalledTimes(2);
  });

  it('does not update without a canvas or the current page metric', async () => {
    const viewWithoutCanvas = renderHarness({ canvas: false });

    act(() => {
      viewWithoutCanvas.controls().startPdfiumSelectionAdjustment(pointer(220));
    });
    await act(async () => {
      await flushMicrotasks();
    });
    act(() => {
      viewWithoutCanvas.controls().updatePdfiumSelectionAdjustment(pointer(300));
    });

    expect(viewWithoutCanvas.controls().selectionAction?.draggingHandle).toBeUndefined();
    expect(viewWithoutCanvas.controls().temporaryBoxes).toEqual([]);

    cleanup();

    const viewWithoutMetric = renderHarness({ metrics: {} });
    act(() => {
      viewWithoutMetric.controls().startPdfiumSelectionAdjustment(pointer(220));
    });
    await act(async () => {
      await flushMicrotasks();
    });
    act(() => {
      viewWithoutMetric.controls().updatePdfiumSelectionAdjustment(pointer(300));
    });

    expect(viewWithoutMetric.controls().selectionAction?.draggingHandle).toBeUndefined();
    expect(viewWithoutMetric.controls().temporaryBoxes).toEqual([]);
  });
});
