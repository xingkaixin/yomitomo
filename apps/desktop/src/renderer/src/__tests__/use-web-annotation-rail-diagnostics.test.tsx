// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightBox } from '@yomitomo/core';
import { useWebAnnotationRailDiagnostics } from '../source/web/use-web-annotation-rail-diagnostics';

const boxes: HighlightBox[] = [
  {
    annotationId: 'annotation-1',
    color: '#ffd700',
    height: 20,
    id: 'box-1',
    left: 20,
    top: 180,
    width: 120,
  },
];

let now = 100;

beforeEach(() => {
  vi.useFakeTimers();
  now = 100;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(now))),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => window.clearTimeout(handle)),
  );
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { yomitomoWebAnnotationRailDebug?: boolean })
    .yomitomoWebAnnotationRailDebug;
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWebAnnotationRailDiagnostics', () => {
  it('does not observe or sample the rail while diagnostics are disabled', async () => {
    const recordPerformanceTiming = installDesktopPerformanceRecorder();

    render(<AnnotationRailDiagnosticsProbe />);
    await act(async () => vi.runOnlyPendingTimers());

    expect(MockResizeObserver.instances).toHaveLength(0);
    expect(recordPerformanceTiming).not.toHaveBeenCalled();
  });

  it('derives and records the current rail viewport only when enabled', async () => {
    (
      window as unknown as { yomitomoWebAnnotationRailDebug?: boolean }
    ).yomitomoWebAnnotationRailDebug = true;
    const recordPerformanceTiming = installDesktopPerformanceRecorder();

    render(<AnnotationRailDiagnosticsProbe />);
    await act(async () => vi.runOnlyPendingTimers());

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(recordPerformanceTiming).toHaveBeenCalledWith({
      event: 'reader_annotation_rail_layout',
      data: expect.objectContaining({
        articleId: 'article-1',
        noteCount: 1,
        selectedAnnotationId: 'annotation-1',
        viewport: { bottom: 560, height: 400, top: 160 },
        visibleAnchorCount: 1,
      }),
    });

    now = 200;
    const scrollElement = screen.getByTestId('scroll');
    scrollElement.scrollTop = 300;
    scrollElement.dispatchEvent(new Event('scroll'));
    await act(async () => vi.runOnlyPendingTimers());

    expect(recordPerformanceTiming).toHaveBeenLastCalledWith({
      event: 'reader_annotation_rail_layout',
      data: expect.objectContaining({ viewport: { bottom: 600, height: 400, top: 200 } }),
    });
  });
});

function AnnotationRailDiagnosticsProbe() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  useWebAnnotationRailDiagnostics({
    articleId: 'article-1',
    boxes,
    canvasRef,
    railRef,
    scrollRef,
    selectedAnnotationId: 'annotation-1',
  });

  return (
    <div
      data-testid="scroll"
      ref={(element) => {
        scrollRef.current = element;
        if (!element) return;
        defineNumberProperty(element, 'clientHeight', 400);
        defineNumberProperty(element, 'scrollHeight', 1200);
        defineNumberProperty(element, 'scrollTop', 260, true);
        mockRect(element, { height: 400, top: 20, width: 900 });
      }}
    >
      <div
        ref={(element) => {
          canvasRef.current = element;
          if (!element) return;
          defineNumberProperty(element, 'offsetTop', 100);
          mockRect(element, { height: 1000, top: 50, width: 800 });
        }}
      >
        <aside
          ref={(element) => {
            railRef.current = element;
            if (element) mockRect(element, { height: 900, left: 700, top: 50, width: 100 });
          }}
        >
          <div
            className="reader-note"
            data-annotation-id="annotation-1"
            ref={(element) => {
              if (element) mockRect(element, { height: 40, left: 710, top: 230, width: 80 });
            }}
            style={{ top: 180 }}
          />
        </aside>
      </div>
    </div>
  );
}

function installDesktopPerformanceRecorder() {
  const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { recordPerformanceTiming },
  });
  return recordPerformanceTiming;
}

function defineNumberProperty(
  element: HTMLElement,
  property: string,
  value: number,
  writable = false,
) {
  Object.defineProperty(element, property, { configurable: true, value, writable });
}

function mockRect(element: Element, values: Partial<DOMRect>) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect(values),
  });
}

function rect(values: Partial<DOMRect>): DOMRect {
  const left = values.left ?? 0;
  const top = values.top ?? 0;
  const width = values.width ?? 0;
  const height = values.height ?? 0;
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  constructor(_callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe() {}

  unobserve() {}

  disconnect() {}
}
