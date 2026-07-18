// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import type { Annotation } from '@yomitomo/shared';

const mocks = vi.hoisted(() => ({
  animateTheaterHighlight: vi.fn(),
  annotationToPublicAgent: vi.fn(),
  rangeFromOffsets: vi.fn(),
  rangeHighlightBoxes: vi.fn(),
  resolveTextAnchor: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock('@yomitomo/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yomitomo/shared')>();
  return {
    ...actual,
    resolveTextAnchor: mocks.resolveTextAnchor,
  };
});

vi.mock('@yomitomo/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yomitomo/core')>();
  return {
    ...actual,
    annotationToPublicAgent: mocks.annotationToPublicAgent,
    rangeFromOffsets: mocks.rangeFromOffsets,
    rangeHighlightBoxes: mocks.rangeHighlightBoxes,
  };
});

vi.mock('../reader-animation', () => ({
  animateTheaterHighlight: mocks.animateTheaterHighlight,
  sleep: mocks.sleep,
}));

import {
  playAgentAnnotationPlayback,
  saveAgentAnnotationAsThought,
} from './reader-agent-annotation-playback';

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: 'ai',
    color: '#54cda0',
    agentId: 'agent_1',
    agentNickname: '林知微',
    comments: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  };
}

function rect(values: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 10,
    y: 20,
    top: 20,
    right: 60,
    bottom: 40,
    left: 10,
    width: 50,
    height: 20,
    toJSON: () => ({}),
    ...values,
  } as DOMRect;
}

function ref<T>(current: T): React.RefObject<T> {
  return { current } as React.RefObject<T>;
}

function saveAnnotationMock(annotationsRef: React.MutableRefObject<Annotation[]>) {
  return vi.fn(async (nextAnnotation: Annotation) => {
    const existing = annotationsRef.current.some((item) => item.id === nextAnnotation.id);
    annotationsRef.current = existing
      ? annotationsRef.current.map((item) =>
          item.id === nextAnnotation.id ? nextAnnotation : item,
        )
      : [...annotationsRef.current, nextAnnotation];
  });
}

function playbackOptions(nextAnnotation = annotation()) {
  const article = document.createElement('article');
  article.textContent = 'quote';
  const canvas = document.createElement('div');
  const surface = document.createElement('div');
  const annotationsRef: React.MutableRefObject<Annotation[]> = { current: [] };
  const saveAnnotation = saveAnnotationMock(annotationsRef);

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect({ top: 0, left: 0 }));
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
    rect({ top: 0, right: 320, bottom: 480, left: 0, width: 320, height: 480 }),
  );

  return {
    annotation: nextAnnotation,
    articleRef: ref<HTMLElement | null>(article),
    canvasRef: ref<HTMLDivElement | null>(canvas),
    surfaceRef: ref<HTMLDivElement | null>(surface),
    annotationsRef,
    saveAnnotation,
    setActiveId: vi.fn(),
    setAgentTheaterBoxes: vi.fn(),
    getVirtualCursor: vi.fn(),
    getVirtualReadingMode: vi.fn(),
    updateVirtualCursor: vi.fn(),
    finishVirtualReading: vi.fn(),
    readerLog: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveTextAnchor.mockReturnValue({ start: 0, end: 5 });
  mocks.rangeHighlightBoxes.mockReturnValue([]);
  mocks.animateTheaterHighlight.mockImplementation(async (_boxes, _length, onFrame) => onFrame([]));
  mocks.sleep.mockResolvedValue(undefined);
});

describe('playAgentAnnotationPlayback', () => {
  it('adds repeated exact text as a top-level thought on the first annotation', async () => {
    const existing = annotation({
      id: 'annotation_existing',
      anchor: { exact: 'same quote', prefix: '', suffix: '', start: 0, end: 10 },
      comments: [
        {
          id: 'comment_existing',
          author: 'ai',
          content: 'first thought',
          createdAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    });
    const incoming = annotation({
      id: 'annotation_incoming',
      anchor: { exact: 'same   quote', prefix: '', suffix: '', start: 20, end: 30 },
      comments: [
        {
          id: 'comment_incoming',
          author: 'ai',
          content: 'second thought',
          createdAt: '2026-05-16T00:01:00.000Z',
          replyTo: 'stale-thread',
        },
      ],
      updatedAt: '2026-05-16T00:01:00.000Z',
    });
    const annotationsRef: React.MutableRefObject<Annotation[]> = { current: [existing] };
    const saveAnnotation = saveAnnotationMock(annotationsRef);

    const activeId = await saveAgentAnnotationAsThought({
      annotation: incoming,
      annotationsRef,
      saveAnnotation,
    });

    expect(activeId).toBe(existing.id);
    expect(annotationsRef.current).toHaveLength(1);
    expect(annotationsRef.current[0]?.comments).toEqual([
      existing.comments[0],
      { ...incoming.comments[0], replyTo: undefined },
    ]);
    expect(annotationsRef.current[0]?.updatedAt).toBe(incoming.updatedAt);
  });

  it('does not duplicate an agent annotation that was already saved', async () => {
    const existing = annotation();
    const annotationsRef: React.MutableRefObject<Annotation[]> = { current: [existing] };
    const saveAnnotation = saveAnnotationMock(annotationsRef);

    const activeId = await saveAgentAnnotationAsThought({
      annotation: existing,
      annotationsRef,
      saveAnnotation,
    });

    expect(activeId).toBe(existing.id);
    expect(annotationsRef.current).toEqual([existing]);
    expect(saveAnnotation).not.toHaveBeenCalled();
  });

  it('saves the annotation when resolved range has no visible rects', async () => {
    const target = annotation();
    const options = playbackOptions(target);
    mocks.rangeFromOffsets.mockReturnValue({ getClientRects: () => [] });

    await playAgentAnnotationPlayback(options);

    expect(options.readerLog).toHaveBeenCalledWith('agent.play.range_empty', {
      annotationId: target.id,
    });
    expect(options.saveAnnotation).toHaveBeenCalledWith(target);
    expect(options.setActiveId).not.toHaveBeenCalled();
  });

  it('animates and saves a visible annotation', async () => {
    const target = annotation();
    const options = playbackOptions(target);
    mocks.rangeFromOffsets.mockReturnValue({ getClientRects: () => [rect()] });
    mocks.rangeHighlightBoxes.mockReturnValue([
      { id: 'box_1', top: 20, left: 10, width: 50, height: 20 },
    ]);
    mocks.animateTheaterHighlight.mockImplementation(async (boxes, _length, onFrame) =>
      onFrame(boxes),
    );

    await playAgentAnnotationPlayback(options);

    expect(options.saveAnnotation).toHaveBeenCalledWith(target);
    expect(options.setActiveId).toHaveBeenCalledWith(target.id);
    expect(options.setAgentTheaterBoxes).toHaveBeenLastCalledWith([]);
    expect(options.finishVirtualReading).toHaveBeenCalledWith(target.agentId);
  });
});
