import type React from 'react';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  annotationPrimaryComment,
  annotationThreadComments,
  buildTocAnnotationStats as buildCoreTocAnnotationStats,
  buildHighlightSegments,
  highlightSegmentStyle,
  highlightStyle,
  isQuestionComment,
  isPrimaryTocItem,
  questionStatusOrOpen,
  timestamp,
  updateAnnotationComment,
} from '@yomitomo/core';
import type { ReaderSettings } from './reader-components';
import type { HighlightBox, TocItem } from '@yomitomo/core';

export type AnnotationRailItem = {
  annotation: Annotation;
  isStackFront: boolean;
  stackCount: number;
  stackIndex: number;
  style: React.CSSProperties;
};

export const defaultUserProfile: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '',
};

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860,
};

export function normalizeUserProfile(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUserProfile,
    ...user,
    id: user?.id || defaultUserProfile.id,
    annotationColor: user?.annotationColor || defaultUserProfile.annotationColor,
  };
}

export function toCachedArticleRecord(record: ArticleRecord): ArticleRecord {
  return {
    ...record,
    contentHtml: undefined,
  };
}

export function agentQueueKey(annotation: Annotation) {
  return annotation.agentId || annotation.agentUsername || '__agent__';
}

export function isNewerArticleRecord(record: ArticleRecord, current: ArticleRecord | null) {
  return !current || timestamp(record.updatedAt) > timestamp(current.updatedAt);
}

export function applyAgentCommentDelta(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  delta: string,
) {
  return updateAnnotationComment(annotations, annotationId, commentId, (comment) => ({
    ...comment,
    content: comment.content + delta,
  }));
}

export function buildTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return buildCoreTocAnnotationStats(tocItems, annotations, (annotation) =>
    annotationColor(annotation, userProfile, agents),
  );
}

export function countOpenQuestions(annotations: Annotation[]) {
  return annotations.reduce((count, annotation) => {
    const annotationQuestion =
      annotation.annotationType === 'question' || annotation.questionStatus
        ? questionStatusOrOpen(annotation.questionStatus) === 'open'
          ? 1
          : 0
        : 0;
    const commentQuestions = annotationThreadComments(annotation).filter(
      (comment) =>
        isQuestionComment(comment) && questionStatusOrOpen(comment.questionStatus) === 'open',
    ).length;
    return count + annotationQuestion + commentQuestions;
  }, 0);
}

export function buildAnnotationRailItems(
  annotations: Annotation[],
  boxes: HighlightBox[],
  activeId: string | null,
  noteHeights: Record<string, number> = {},
): AnnotationRailItem[] {
  const boxesByAnnotation = new Map<string, HighlightBox[]>();
  for (const box of boxes) {
    const items = boxesByAnnotation.get(box.annotationId) || [];
    items.push(box);
    boxesByAnnotation.set(box.annotationId, items);
  }

  const positioned = annotations
    .map((annotation, index) => {
      const annotationBoxes = boxesByAnnotation.get(annotation.id) || [];
      const top =
        annotationBoxes.length > 0
          ? Math.max(0, Math.min(...annotationBoxes.map((box) => box.top)) - 10)
          : 120 + index * 150;
      return {
        annotation,
        index,
        start: annotation.anchor.start,
        end: annotation.anchor.end,
        top,
      };
    })
    .toSorted((left, right) => left.top - right.top || left.index - right.index);

  const groups: Array<typeof positioned> = [];
  for (const item of positioned) {
    const group = groups.find((items) =>
      items.some((groupItem) => anchorsOverlap(item, groupItem)),
    );
    if (group) group.push(item);
    else groups.push([item]);
  }

  const railGroups = groups
    .map((group) =>
      group.toSorted((left, right) => left.top - right.top || left.index - right.index),
    )
    .map((group) => ({
      group,
      desiredTop: group[0]?.top || 0,
      height: estimateRailGroupHeight(group, activeId, noteHeights),
    }))
    .toSorted((left, right) => left.desiredTop - right.desiredTop);

  const groupTops = railGroups.map((group) => group.desiredTop);
  for (let index = 1; index < railGroups.length; index += 1) {
    const previousBottom = groupTops[index - 1]! + railGroups[index - 1]!.height + 18;
    groupTops[index] = Math.max(groupTops[index]!, previousBottom);
  }
  for (let index = railGroups.length - 2; index >= 0; index -= 1) {
    const nextTop = groupTops[index + 1]! - railGroups[index]!.height - 18;
    groupTops[index] = Math.max(0, Math.min(groupTops[index]!, nextTop));
  }

  return railGroups.flatMap(({ group }, groupIndex) => {
    const stackCount = group.length;
    const groupTop = groupTops[groupIndex] || 0;
    const activeIndex = group.findIndex((item) => item.annotation.id === activeId);
    const frontIndex = activeIndex >= 0 ? activeIndex : 0;
    return group.map((item, stackIndex) => {
      const stackDepth = stackCount > 1 ? (stackIndex - frontIndex + stackCount) % stackCount : 0;
      const isStackFront = stackDepth === 0;
      const isActive = item.annotation.id === activeId;
      return {
        annotation: item.annotation,
        isStackFront,
        stackCount,
        stackIndex: stackDepth,
        style: {
          top: groupTop + stackDepth * 42,
          zIndex: isActive ? 90 : isStackFront ? 40 : 10 + stackCount - stackDepth,
          '--stack-offset': `${Math.min(stackDepth, 4) * 14}px`,
        },
      };
    });
  });
}

export function readerAnnotationScrollTop({
  annotationId,
  boxes,
  canvasOffsetTop,
  scrollHeight,
  viewportHeight,
}: {
  annotationId: string;
  boxes: HighlightBox[];
  canvasOffsetTop: number;
  scrollHeight: number;
  viewportHeight: number;
}) {
  const annotationBoxes = boxes.filter((box) => box.annotationId === annotationId);
  if (annotationBoxes.length === 0 || viewportHeight <= 0) return null;

  const top = Math.min(...annotationBoxes.map((box) => box.top));
  const bottom = Math.max(...annotationBoxes.map((box) => box.top + box.height));
  const targetTop = canvasOffsetTop + (top + bottom) / 2 - viewportHeight / 2;
  const maxTop = Math.max(0, scrollHeight - viewportHeight);

  return Math.max(0, Math.min(maxTop, targetTop));
}

export function getShortcutModifier() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export { buildHighlightSegments, highlightSegmentStyle, highlightStyle, isPrimaryTocItem };

function anchorsOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

function estimateRailGroupHeight(
  group: Array<{ annotation: Annotation }>,
  activeId: string | null,
  noteHeights: Record<string, number>,
) {
  if (group.length === 0) return 176;

  const activeIndex = group.findIndex((item) => item.annotation.id === activeId);
  const frontIndex = activeIndex >= 0 ? activeIndex : 0;
  return Math.max(
    ...group.map((item, stackIndex) => {
      const stackDepth =
        group.length > 1 ? (stackIndex - frontIndex + group.length) % group.length : 0;
      return annotationCardHeight(item.annotation, noteHeights) + stackDepth * 42;
    }),
  );
}

function estimateAnnotationCardHeight(annotation: Annotation) {
  const quoteLines = Math.max(1, Math.ceil(annotation.anchor.exact.length / 24));
  const primaryComment = annotationPrimaryComment(annotation)?.content || '';
  const commentLines = primaryComment
    ? Math.min(5, Math.max(1, Math.ceil(primaryComment.length / 28)))
    : 0;
  return 118 + quoteLines * 18 + commentLines * 24;
}

function annotationCardHeight(annotation: Annotation, noteHeights: Record<string, number>) {
  const measuredHeight = noteHeights[annotation.id];
  return measuredHeight && measuredHeight > 0
    ? measuredHeight
    : estimateAnnotationCardHeight(annotation);
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function animateTheaterHighlight(
  boxes: HighlightBox[],
  textLength: number,
  onFrame: (boxes: HighlightBox[]) => void,
) {
  const sortedBoxes = [...boxes].toSorted(
    (left, right) => left.top - right.top || left.left - right.left,
  );
  const duration = clampNumber(textLength * 28, 780, 2600, 1200);
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased =
        progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const boxProgress = eased * sortedBoxes.length;
      const nextBoxes = sortedBoxes.flatMap((box, index) => {
        if (index < Math.floor(boxProgress)) return [box];
        if (index > Math.floor(boxProgress)) return [];

        const width = box.width * Math.max(0.08, boxProgress - index);
        return [{ ...box, width }];
      });
      onFrame(nextBoxes);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        onFrame(sortedBoxes);
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}
