// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { useWebReaderBoxes } from '../source/web/use-web-reader-boxes';

const now = '2026-05-16T12:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};
const probeArticle = article();
const probeAnnotationAgents: PublicAgent[] = [];
const probeAnnotations: Annotation[] = [];

function article(): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '网页文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()))),
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
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useWebReaderBoxes', () => {
  it('ignores repeated resize notifications when reader dimensions are unchanged', async () => {
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { recordPerformanceTiming },
    });

    render(<WebReaderBoxesProbe />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(recordPerformanceTiming).toHaveBeenCalledTimes(1);

    await act(async () => {
      MockResizeObserver.instances[0]?.trigger();
      vi.runOnlyPendingTimers();
    });
    await act(async () => {
      MockResizeObserver.instances[0]?.trigger();
      vi.runOnlyPendingTimers();
    });

    expect(recordPerformanceTiming).toHaveBeenCalledTimes(1);
  });
});

function WebReaderBoxesProbe() {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  useWebReaderBoxes({
    annotationAgents: probeAnnotationAgents,
    annotations: probeAnnotations,
    article: probeArticle,
    articleRef,
    canvasRef,
    contentHtml: '<p>正文</p>',
    userProfile,
  });

  return (
    <div ref={canvasRef} data-testid="canvas">
      <article ref={articleRef}>
        <p>正文</p>
      </article>
    </div>
  );
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  private readonly callback: ResizeObserverCallback;
  private readonly elements = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  trigger() {
    const entries = Array.from(this.elements).map(
      (element) =>
        ({
          target: element,
          contentRect: element.getBoundingClientRect(),
        }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}
