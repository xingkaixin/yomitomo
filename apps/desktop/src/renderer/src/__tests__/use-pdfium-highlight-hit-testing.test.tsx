// @vitest-environment jsdom

import type React from 'react';
import { useRef, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { createPdfTextAnchor } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type {
  HighlightChoice,
  PendingComposer,
  SelectionAction,
} from '@yomitomo/reader-ui/reader-app-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePdfiumHighlightHitTesting } from '../source/pdfium/use-pdfium-highlight-hit-testing';

type HookState = ReturnType<typeof usePdfiumHighlightHitTesting>;
type HookOptions = Parameters<typeof usePdfiumHighlightHitTesting>[0];

type HarnessControls = HookState & {
  highlightChoice: HighlightChoice | null;
};

const selectionAction = {
  x: 10,
  y: 20,
  anchor: createPdfTextAnchor({
    pageText: 'abcde',
    pageIndex: 0,
    pageWidth: 100,
    pageHeight: 100,
    start: 0,
    end: 2,
    rects: [{ x: 0, y: 0, width: 0.2, height: 0.1 }],
  }),
} satisfies SelectionAction;

const composer = selectionAction satisfies PendingComposer;

function box(annotationId: string, left: number, top: number): HighlightBox {
  return {
    id: `${annotationId}-box`,
    annotationId,
    color: '#f4c95d',
    left,
    top,
    width: 20,
    height: 20,
  };
}

function renderHarness({
  boxes = [box('annotation_1', 40, 50)],
  canvas = true,
  currentComposer = null,
  currentSelectionAction = null,
  onOpenAnnotation = vi.fn(),
}: {
  boxes?: HighlightBox[];
  canvas?: boolean;
  currentComposer?: PendingComposer | null;
  currentSelectionAction?: SelectionAction | null;
  onOpenAnnotation?: HookOptions['onOpenAnnotation'];
} = {}) {
  let controls: HarnessControls | null = null;

  function Harness() {
    const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const state = usePdfiumHighlightHitTesting({
      boxes,
      canvasRef,
      selectionAction: currentSelectionAction,
      composer: currentComposer,
      onOpenAnnotation,
      setHighlightChoice,
    });
    controls = { ...state, highlightChoice };
    return canvas ? <div ref={canvasRef} data-testid="canvas" /> : null;
  }

  const view = render(<Harness />);
  const canvasElement = view.queryByTestId('canvas');
  if (canvasElement) {
    vi.spyOn(canvasElement, 'getBoundingClientRect').mockReturnValue(rect());
  }

  return {
    ...view,
    controls: () => {
      if (!controls) throw new Error('PDFium highlight hit-testing hook did not render');
      return controls;
    },
    onOpenAnnotation,
  };
}

function rect(): DOMRect {
  return {
    x: 100,
    y: 200,
    left: 100,
    top: 200,
    width: 500,
    height: 700,
    right: 600,
    bottom: 900,
    toJSON: () => ({}),
  };
}

function highlightClickEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
  } as React.MouseEvent<HTMLButtonElement>;
}

function canvasClickEvent({
  button = 0,
  clientX = 140,
  clientY = 250,
  defaultPrevented = false,
  detail = 1,
  preventDefault = vi.fn(),
  target = pageTarget(),
}: {
  button?: number;
  clientX?: number;
  clientY?: number;
  defaultPrevented?: boolean;
  detail?: number;
  preventDefault?: () => void;
  target?: Element;
} = {}) {
  return {
    button,
    clientX,
    clientY,
    defaultPrevented,
    detail,
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    preventDefault,
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    target,
    type: 'click',
  } as unknown as React.MouseEvent<HTMLDivElement>;
}

function pageTarget() {
  const page = document.createElement('div');
  page.dataset.pdfiumPageIndex = '0';
  const target = document.createElement('span');
  page.append(target);
  document.body.append(page);
  return target;
}

describe('usePdfiumHighlightHitTesting', () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('skips hit testing while selection action or composer is open', () => {
    const selectionView = renderHarness({ currentSelectionAction: selectionAction });
    const selectionHandled = selectionView
      .controls()
      .handleHighlightClick('annotation_1', highlightClickEvent(140, 250), ['annotation_1']);

    expect(selectionHandled).toBe(false);
    expect(selectionView.onOpenAnnotation).not.toHaveBeenCalled();
    expect(selectionView.controls().highlightChoice).toBeNull();

    cleanup();
    const composerView = renderHarness({ currentComposer: composer });
    const composerHandled = composerView
      .controls()
      .handleHighlightClick('annotation_1', highlightClickEvent(140, 250), ['annotation_1']);

    expect(composerHandled).toBe(false);
    expect(composerView.onOpenAnnotation).not.toHaveBeenCalled();
    expect(composerView.controls().highlightChoice).toBeNull();
  });

  it('opens the fallback annotation when the canvas is missing', () => {
    const view = renderHarness({ canvas: false });

    const handled = view
      .controls()
      .handleHighlightClick('annotation_1', highlightClickEvent(140, 250), ['annotation_1']);

    expect(handled).toBe(true);
    expect(view.onOpenAnnotation).toHaveBeenCalledWith('annotation_1');
  });

  it('opens a single hit annotation directly', () => {
    const view = renderHarness();

    const handled = view
      .controls()
      .handleHighlightClick('annotation_fallback', highlightClickEvent(140, 250), []);

    expect(handled).toBe(true);
    expect(view.onOpenAnnotation).toHaveBeenCalledWith('annotation_1');
    expect(view.controls().highlightChoice).toBeNull();
  });

  it('opens the highlight choice for multiple hits', () => {
    const view = renderHarness({
      boxes: [box('annotation_1', 40, 50), box('annotation_2', 45, 50)],
    });

    act(() => {
      view.controls().handleHighlightClick('annotation_1', highlightClickEvent(145, 250), []);
    });

    expect(view.onOpenAnnotation).not.toHaveBeenCalled();
    expect(view.controls().highlightChoice).toEqual({
      x: 53,
      y: 58,
      annotationIds: ['annotation_1', 'annotation_2'],
    });
  });

  it('returns false for empty hits and leaves canvas clicks unprevented', () => {
    const view = renderHarness();
    const emptyHighlightHandled = view
      .controls()
      .handleHighlightClick('annotation_fallback', highlightClickEvent(10, 10), []);
    const preventDefault = vi.fn();
    const event = canvasClickEvent({ clientX: 10, clientY: 10, preventDefault });

    view.controls().handlePdfiumCanvasClickCapture(event);

    expect(emptyHighlightHandled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(view.onOpenAnnotation).not.toHaveBeenCalled();
  });

  it('returns early for suppressed continuous selection, non-left, and prevented canvas clicks', () => {
    const view = renderHarness();
    const continuousPreventDefault = vi.fn();
    const nonLeftPreventDefault = vi.fn();
    const preventedPreventDefault = vi.fn();
    const continuousEvent = canvasClickEvent({
      detail: 3,
      preventDefault: continuousPreventDefault,
    });
    const nonLeftEvent = canvasClickEvent({ button: 2, preventDefault: nonLeftPreventDefault });
    const preventedEvent = canvasClickEvent({
      defaultPrevented: true,
      preventDefault: preventedPreventDefault,
    });

    view.controls().handlePdfiumCanvasClickCapture(continuousEvent);
    view.controls().handlePdfiumCanvasClickCapture(nonLeftEvent);
    view.controls().handlePdfiumCanvasClickCapture(preventedEvent);

    expect(continuousPreventDefault).toHaveBeenCalledTimes(1);
    expect(nonLeftPreventDefault).not.toHaveBeenCalled();
    expect(preventedPreventDefault).not.toHaveBeenCalled();
    expect(view.onOpenAnnotation).not.toHaveBeenCalled();
  });

  it('prevents the canvas click default after a successful hit', () => {
    const view = renderHarness();
    const preventDefault = vi.fn();
    const event = canvasClickEvent({ preventDefault });

    view.controls().handlePdfiumCanvasClickCapture(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(view.onOpenAnnotation).toHaveBeenCalledWith('annotation_1');
  });
});
