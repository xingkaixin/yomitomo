// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent } from '@yomitomo/shared';

const mocks = vi.hoisted(() => ({
  animateTheaterHighlight: vi.fn(),
  foliateRangeHighlightBoxes: vi.fn(),
  mappedFoliateRangeRects: vi.fn(),
  rangeForEbookAnchorInDocument: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock('@yomitomo/reader-ui/reader-animation', () => ({
  animateTheaterHighlight: mocks.animateTheaterHighlight,
  sleep: mocks.sleep,
}));

vi.mock('../source/ebook/app-ebook-reader-utils', () => ({
  foliateRangeHighlightBoxes: mocks.foliateRangeHighlightBoxes,
  mappedFoliateRangeRects: mocks.mappedFoliateRangeRects,
  rangeForEbookAnchorInDocument: mocks.rangeForEbookAnchorInDocument,
}));

import { playEbookAgentAnnotationPlayback } from '../source/ebook/app-source-ebook-agent-playback';

const agent: PublicAgent = {
  id: 'agent_1',
  kind: 'annotation',
  enabled: true,
  nickname: '林知微',
  username: 'lin_zhiwei',
  avatar: '',
  annotationColor: '#54cda0',
  annotationDensity: 'medium',
  personalityName: '林知微',
  temperature: 0.2,
};

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: 'ai',
    color: '#54cda0',
    agentId: agent.id,
    agentNickname: agent.nickname,
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

function playbackOptions(target = annotation()) {
  const canvasElement = document.createElement('div');
  const surfaceElement = document.createElement('div');
  vi.spyOn(canvasElement, 'getBoundingClientRect').mockReturnValue(
    rect({ top: 0, right: 320, bottom: 480, left: 0, width: 320, height: 480 }),
  );
  vi.spyOn(surfaceElement, 'getBoundingClientRect').mockReturnValue(
    rect({ top: 0, right: 320, bottom: 480, left: 0, width: 320, height: 480 }),
  );

  return {
    articleId: 'article_1',
    annotation: target,
    canvasElement,
    surfaceElement,
    document,
    cursorAgent: agent,
    isCurrentArticle: vi.fn(() => true),
    appendAgentAnnotationToArticle: vi.fn(async () => target.id),
    goToAnnotation: vi.fn(async () => true),
    finishEbookVirtualReading: vi.fn(),
    stopEbookVirtualReadingTimer: vi.fn(),
    updateEbookVirtualCursor: vi.fn(),
    setAgentTheaterBoxes: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rangeForEbookAnchorInDocument.mockReturnValue({} as Range);
  mocks.foliateRangeHighlightBoxes.mockReturnValue([]);
  mocks.animateTheaterHighlight.mockImplementation(async (_boxes, _length, onFrame) => onFrame([]));
  mocks.sleep.mockResolvedValue(undefined);
});

describe('playEbookAgentAnnotationPlayback', () => {
  it('saves and reveals when the EPUB range has no mapped rects', async () => {
    const target = annotation();
    const options = playbackOptions(target);
    mocks.mappedFoliateRangeRects.mockReturnValue([]);

    await playEbookAgentAnnotationPlayback({ ...options, revealMissingRange: true });

    expect(options.appendAgentAnnotationToArticle).toHaveBeenCalledWith(options.articleId, target);
    expect(options.goToAnnotation).toHaveBeenCalledWith(target.id);
    expect(options.finishEbookVirtualReading).toHaveBeenCalledWith(agent.id);
    expect(options.stopEbookVirtualReadingTimer).not.toHaveBeenCalled();
  });

  it('plays a visible EPUB annotation through the theater highlight path', async () => {
    const target = annotation();
    const options = playbackOptions(target);
    mocks.mappedFoliateRangeRects.mockReturnValue([rect()]);
    mocks.foliateRangeHighlightBoxes.mockReturnValue([
      { id: 'box_1', annotationId: '', color: '#f4c95d', top: 20, left: 10, width: 50, height: 20 },
    ]);
    mocks.animateTheaterHighlight.mockImplementation(async (boxes, _length, onFrame) =>
      onFrame(boxes),
    );

    await playEbookAgentAnnotationPlayback(options);

    expect(options.stopEbookVirtualReadingTimer).toHaveBeenCalledWith(agent.id);
    expect(options.appendAgentAnnotationToArticle).toHaveBeenCalledWith(options.articleId, target);
    expect(options.setAgentTheaterBoxes).toHaveBeenLastCalledWith([]);
    expect(options.finishEbookVirtualReading).toHaveBeenCalledWith(agent.id);
  });
});
