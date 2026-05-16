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

vi.mock('@yomitomo/core', () => ({
  annotationToPublicAgent: mocks.annotationToPublicAgent,
  rangeFromOffsets: mocks.rangeFromOffsets,
  rangeHighlightBoxes: mocks.rangeHighlightBoxes,
}));

vi.mock('./reader-utils', () => ({
  animateTheaterHighlight: mocks.animateTheaterHighlight,
  sleep: mocks.sleep,
}));

import { playAgentAnnotationPlayback } from './reader-agent-annotation-playback';

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

function playbackOptions(nextAnnotation = annotation()) {
  const article = document.createElement('article');
  article.textContent = 'quote';
  const canvas = document.createElement('div');
  const surface = document.createElement('div');
  const annotationsRef: React.MutableRefObject<Annotation[]> = { current: [] };
  const saveAnnotations = vi.fn(async (annotations: Annotation[]) => {
    annotationsRef.current = annotations;
  });

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
    saveAnnotations,
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
  it('saves the annotation when resolved range has no visible rects', async () => {
    const target = annotation();
    const options = playbackOptions(target);
    mocks.rangeFromOffsets.mockReturnValue({ getClientRects: () => [] });

    await playAgentAnnotationPlayback(options);

    expect(options.readerLog).toHaveBeenCalledWith('agent.play.range_empty', {
      annotationId: target.id,
    });
    expect(options.saveAnnotations).toHaveBeenCalledWith([target]);
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

    expect(options.saveAnnotations).toHaveBeenCalledWith([target]);
    expect(options.setActiveId).toHaveBeenCalledWith(target.id);
    expect(options.setAgentTheaterBoxes).toHaveBeenLastCalledWith([]);
    expect(options.finishVirtualReading).toHaveBeenCalledWith(target.agentId);
  });
});
