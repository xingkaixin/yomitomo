import type { Annotation, PublicAgent } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { animateTheaterHighlight, sleep, type VirtualCursorState } from '@yomitomo/reader-ui';
import {
  foliateRangeHighlightBoxes,
  mappedFoliateRangeRects,
  rangeForEbookAnchorInDocument,
} from './app-ebook-reader-utils';

type PlayEbookAgentAnnotationPlaybackOptions = {
  articleId: string;
  annotation: Annotation;
  revealMissingRange?: boolean;
  canvasElement: HTMLDivElement | null;
  surfaceElement: HTMLDivElement | null;
  document: Document | null;
  cursorAgent: PublicAgent | undefined;
  isCurrentArticle: (articleId: string) => boolean;
  appendAgentAnnotationToArticle: (articleId: string, annotation: Annotation) => Promise<void>;
  goToAnnotation: (annotationId: string) => Promise<boolean>;
  finishEbookVirtualReading: (agentId: string) => void;
  stopEbookVirtualReadingTimer: (agentId: string) => void;
  updateEbookVirtualCursor: (cursorId: string, cursor: VirtualCursorState | null) => void;
  setAgentTheaterBoxes: (boxes: HighlightBox[]) => void;
};

type EbookPlaybackTarget = {
  canvasRect: DOMRect;
  firstRect: DOMRect;
  lastRect: DOMRect;
  range: Range;
};

export async function playEbookAgentAnnotationPlayback({
  articleId,
  annotation,
  revealMissingRange,
  canvasElement,
  surfaceElement,
  document,
  cursorAgent,
  isCurrentArticle,
  appendAgentAnnotationToArticle,
  goToAnnotation,
  finishEbookVirtualReading,
  stopEbookVirtualReadingTimer,
  updateEbookVirtualCursor,
  setAgentTheaterBoxes,
}: PlayEbookAgentAnnotationPlaybackOptions) {
  if (!isCurrentArticle(articleId)) {
    await appendAgentAnnotationToArticle(articleId, annotation);
    return;
  }

  const cursorId = ebookAnnotationCursorId(annotation, cursorAgent);
  const target = resolveEbookPlaybackTarget(document, canvasElement, annotation);
  if (!target || !surfaceElement) {
    await saveEbookAnnotationFallback({
      annotation,
      articleId,
      appendAgentAnnotationToArticle,
      cursorId,
      finishEbookVirtualReading,
      goToAnnotation,
      revealMissingRange,
    });
    return;
  }

  const surfaceRect = surfaceElement.getBoundingClientRect();
  if (!isRectVisibleInSurface(target.firstRect, surfaceRect)) {
    await playOffscreenEbookAnnotation({
      annotation,
      articleId,
      appendAgentAnnotationToArticle,
      cursorAgent,
      cursorId,
      finishEbookVirtualReading,
      firstRect: target.firstRect,
      goToAnnotation,
      revealMissingRange,
      surfaceRect,
      updateEbookVirtualCursor,
    });
    return;
  }

  await playVisibleEbookAnnotation({
    annotation,
    articleId,
    appendAgentAnnotationToArticle,
    cursorAgent,
    cursorId,
    finishEbookVirtualReading,
    firstRect: target.firstRect,
    lastRect: target.lastRect,
    range: target.range,
    canvasRect: target.canvasRect,
    setAgentTheaterBoxes,
    stopEbookVirtualReadingTimer,
    updateEbookVirtualCursor,
  });
}

function resolveEbookPlaybackTarget(
  document: Document | null,
  canvasElement: HTMLDivElement | null,
  annotation: Annotation,
): EbookPlaybackTarget | null {
  const range = document ? rangeForEbookAnchorInDocument(document, annotation.anchor) : null;
  if (!range || !canvasElement) return null;

  const canvasRect = canvasElement.getBoundingClientRect();
  const rects = mappedFoliateRangeRects(range, canvasRect);
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  return firstRect && lastRect ? { canvasRect, firstRect, lastRect, range } : null;
}

async function saveEbookAnnotationFallback({
  annotation,
  articleId,
  appendAgentAnnotationToArticle,
  cursorId,
  finishEbookVirtualReading,
  goToAnnotation,
  revealMissingRange,
}: Pick<
  PlayEbookAgentAnnotationPlaybackOptions,
  'annotation' | 'articleId' | 'appendAgentAnnotationToArticle' | 'goToAnnotation'
> & {
  cursorId: string;
  finishEbookVirtualReading: (agentId: string) => void;
  revealMissingRange?: boolean;
}) {
  await appendAgentAnnotationToArticle(articleId, annotation);
  if (revealMissingRange) void goToAnnotation(annotation.id);
  finishEbookVirtualReading(cursorId);
}

async function playOffscreenEbookAnnotation({
  annotation,
  articleId,
  appendAgentAnnotationToArticle,
  cursorAgent,
  cursorId,
  finishEbookVirtualReading,
  firstRect,
  goToAnnotation,
  revealMissingRange,
  surfaceRect,
  updateEbookVirtualCursor,
}: Pick<
  PlayEbookAgentAnnotationPlaybackOptions,
  | 'annotation'
  | 'articleId'
  | 'appendAgentAnnotationToArticle'
  | 'cursorAgent'
  | 'finishEbookVirtualReading'
  | 'goToAnnotation'
  | 'revealMissingRange'
  | 'updateEbookVirtualCursor'
> & {
  cursorId: string;
  firstRect: DOMRect;
  surfaceRect: DOMRect;
}) {
  const offscreen = firstRect.top < surfaceRect.top ? 'above' : 'below';
  updateEbookVirtualCursor(cursorId, {
    id: cursorId,
    visible: true,
    x: surfaceRect.left + surfaceRect.width / 2,
    y: offscreen === 'above' ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
    label: `${ebookAnnotationAgentName(annotation)} 正在${offscreen === 'above' ? '上方' : '下方'}批注`,
    offscreen,
    agent: cursorAgent,
  });
  await sleep(700);
  await appendAgentAnnotationToArticle(articleId, annotation);
  if (revealMissingRange) void goToAnnotation(annotation.id);
  finishEbookVirtualReading(cursorId);
}

async function playVisibleEbookAnnotation({
  annotation,
  articleId,
  appendAgentAnnotationToArticle,
  canvasRect,
  cursorAgent,
  cursorId,
  finishEbookVirtualReading,
  firstRect,
  lastRect,
  range,
  setAgentTheaterBoxes,
  stopEbookVirtualReadingTimer,
  updateEbookVirtualCursor,
}: Pick<
  PlayEbookAgentAnnotationPlaybackOptions,
  | 'annotation'
  | 'articleId'
  | 'appendAgentAnnotationToArticle'
  | 'cursorAgent'
  | 'finishEbookVirtualReading'
  | 'setAgentTheaterBoxes'
  | 'stopEbookVirtualReadingTimer'
  | 'updateEbookVirtualCursor'
> & {
  canvasRect: DOMRect;
  cursorId: string;
  firstRect: DOMRect;
  lastRect: DOMRect;
  range: Range;
}) {
  const label = `${ebookAnnotationAgentName(annotation)} 正在批注`;
  stopEbookVirtualReadingTimer(cursorId);
  updateEbookVirtualCursor(cursorId, {
    id: cursorId,
    visible: true,
    x: firstRect.left,
    y: firstRect.top + firstRect.height / 2,
    label,
    offscreen: null,
    agent: cursorAgent,
  });
  await sleep(260);

  const theaterBoxes = foliateRangeHighlightBoxes(
    range,
    canvasRect,
    `theater_${annotation.id}`,
  ).map((box) => Object.assign({}, box, { annotationId: annotation.id, color: annotation.color }));
  await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
    const cursorBox = nextBoxes[nextBoxes.length - 1];
    if (cursorBox) {
      updateEbookVirtualCursor(cursorId, {
        id: cursorId,
        visible: true,
        x: canvasRect.left + cursorBox.left + cursorBox.width,
        y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
        label,
        offscreen: null,
        agent: cursorAgent,
      });
    }
    setAgentTheaterBoxes(nextBoxes);
  });

  await appendAgentAnnotationToArticle(articleId, annotation);
  setAgentTheaterBoxes([]);
  updateEbookVirtualCursor(cursorId, {
    id: cursorId,
    visible: true,
    x: lastRect.right,
    y: lastRect.top + lastRect.height / 2,
    label: `${ebookAnnotationAgentName(annotation)} 批注完成`,
    offscreen: null,
    agent: cursorAgent,
  });
  await sleep(360);
  finishEbookVirtualReading(cursorId);
}

function isRectVisibleInSurface(rect: DOMRect, surfaceRect: DOMRect) {
  return rect.bottom >= surfaceRect.top && rect.top <= surfaceRect.bottom;
}

function ebookAnnotationCursorId(annotation: Annotation, cursorAgent: PublicAgent | undefined) {
  return cursorAgent?.id || annotation.agentId || annotation.agentUsername || annotation.id;
}

function ebookAnnotationAgentName(annotation: Annotation) {
  return annotation.agentNickname || annotation.agentUsername || '助手';
}
