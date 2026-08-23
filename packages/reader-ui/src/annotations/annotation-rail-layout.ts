import type React from 'react';
import type { Annotation } from '@yomitomo/shared';
import { annotationPrimaryComment, type HighlightBox } from '@yomitomo/core';
import { buildRectCollisionGroups, type CollisionRect } from './annotation-rail-collision-groups';

export type AnnotationRailItem = {
  annotation: Annotation;
  isStackFront: boolean;
  railSide: AnnotationRailSide;
  stackCount: number;
  stackIndex: number;
  style: React.CSSProperties;
};

export type AnnotationRailSide = 'left' | 'right' | 'stacked';

export type AnnotationRailLayout = {
  articleCenterX: number;
  articleWidth?: number;
  leftRailLeft: number;
  mode: 'both' | 'left' | 'right' | 'stacked';
  railWidth: number;
  rightRailLeft: number;
  viewportHeight?: number;
  viewportTop?: number;
};

type PositionedAnnotationRailItem = {
  annotation: Annotation;
  index: number;
  preferredSide: AnnotationRailSide;
  rect: CollisionRect | null;
  top: number;
};

type HighlightBoxGroup = {
  boxes: HighlightBox[];
  rect: CollisionRect;
};

type AnnotationRailSpacing = {
  groupGap: number;
  stackTopOffset: number;
  stackXOffset: number;
};

const defaultRailSpacing: AnnotationRailSpacing = {
  groupGap: 18,
  stackTopOffset: 42,
  stackXOffset: 14,
};
const minRailSpacing: AnnotationRailSpacing = {
  groupGap: 8,
  stackTopOffset: 24,
  stackXOffset: 8,
};
const railViewportOverscan = 96;

export function buildAnnotationRailItems(
  annotations: Annotation[],
  boxes: HighlightBox[],
  activeId: string | null,
  noteHeights: Record<string, number> = {},
  railLayout?: AnnotationRailLayout,
): AnnotationRailItem[] {
  const boxesByAnnotation = new Map<string, HighlightBoxGroup>();
  for (const box of boxes) {
    const group = boxesByAnnotation.get(box.annotationId);
    if (group) {
      group.boxes.push(box);
      group.rect = expandRect(group.rect, box);
    } else {
      boxesByAnnotation.set(box.annotationId, { boxes: [box], rect: rectFromBox(box) });
    }
  }

  const positioned = annotations
    .map((annotation, index) => {
      const boxGroup = boxesByAnnotation.get(annotation.id);
      const annotationBoxes = boxGroup?.boxes || [];
      const rect = boxGroup?.rect ?? null;
      const top = rect ? Math.max(0, rect.top - 10) : 120 + index * 150;
      return {
        annotation,
        index,
        preferredSide: annotationRailSide(annotationBoxes, railLayout),
        rect,
        top,
      };
    })
    .toSorted((left, right) => left.top - right.top || left.index - right.index);

  // Translation segments reuse local anchor offsets, so rail collisions must use rendered geometry.
  const groups = buildRectCollisionGroups(positioned, (item) => item.rect);

  const initialRailGroups = groups
    .map((group) =>
      group.toSorted((left, right) => left.top - right.top || left.index - right.index),
    )
    .map((group) => ({
      anchorBottom: railGroupAnchorBottom(group),
      anchorTop: railGroupAnchorTop(group),
      group,
      desiredTop: group[0]?.top || 0,
      height: estimateRailGroupHeight(group, activeId, noteHeights),
      side: railGroupPreferredSide(group),
    }))
    .toSorted((left, right) => left.desiredTop - right.desiredTop);

  const initialGroupSides = resolveRailGroupSides(initialRailGroups, railLayout);
  const railViewport = railViewportBounds(
    railLayout?.viewportTop ?? 0,
    railLayout?.viewportHeight ?? 0,
  );
  const { railGroups, groupSides } = mergeRailPressureGroups(
    initialRailGroups,
    initialGroupSides,
    activeId,
    noteHeights,
    railViewport,
  );
  const groupSpacings = resolveRailGroupSpacings(
    railGroups,
    groupSides,
    activeId,
    noteHeights,
    railLayout?.viewportTop,
    railLayout?.viewportHeight,
  );
  const compactedRailGroups = railGroups.map((railGroup, index) => ({
    ...railGroup,
    height: estimateRailGroupHeight(
      railGroup.group,
      activeId,
      noteHeights,
      groupSpacings[index]?.stackTopOffset ?? defaultRailSpacing.stackTopOffset,
    ),
  }));
  const groupTops = resolveRailGroupTops(
    compactedRailGroups,
    groupSides,
    groupSpacings,
    activeId,
    noteHeights,
    railLayout?.viewportTop,
    railLayout?.viewportHeight,
  );

  return railGroups.flatMap(({ group }, groupIndex) => {
    const stackCount = group.length;
    const groupTop = groupTops[groupIndex] || 0;
    const railSide = groupSides[groupIndex] || 'right';
    const activeIndex = group.findIndex((item) => item.annotation.id === activeId);
    const frontIndex = activeIndex >= 0 ? activeIndex : 0;
    return group.map((item, stackIndex) => {
      const stackDepth = stackCount > 1 ? (stackIndex - frontIndex + stackCount) % stackCount : 0;
      const isStackFront = stackDepth === 0;
      const isActive = item.annotation.id === activeId;
      const cappedDepth = Math.min(stackDepth, 4);
      const style: React.CSSProperties = {
        top: groupTop,
        zIndex: isActive ? 90 : isStackFront ? 40 : 10 + stackCount - stackDepth,
        '--stack-rotate': `${cappedDepth * 9}deg`,
        '--stack-offset': `${cappedDepth * 4}px`,
      } as React.CSSProperties;
      if (railLayout && railLayout.mode !== 'stacked') {
        style.left = railSide === 'left' ? railLayout.leftRailLeft : railLayout.rightRailLeft;
        style.width = railLayout.railWidth;
      }
      return {
        annotation: item.annotation,
        isStackFront,
        railSide,
        stackCount,
        stackIndex: stackDepth,
        style,
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

function rectFromBox(box: HighlightBox): CollisionRect {
  return {
    top: box.top,
    bottom: box.top + box.height,
    left: box.left,
    right: box.left + box.width,
  };
}

function expandRect(rect: CollisionRect, box: HighlightBox): CollisionRect {
  return {
    top: Math.min(rect.top, box.top),
    bottom: Math.max(rect.bottom, box.top + box.height),
    left: Math.min(rect.left, box.left),
    right: Math.max(rect.right, box.left + box.width),
  };
}

function annotationRailSide(
  boxes: HighlightBox[],
  railLayout: AnnotationRailLayout | undefined,
): AnnotationRailSide {
  if (!railLayout || railLayout.mode === 'stacked') return 'right';
  if (railLayout.mode === 'left' || railLayout.mode === 'right') return railLayout.mode;
  if (boxes.length === 0) return 'right';

  const center =
    boxes.reduce((sum, box) => sum + box.left + box.width / 2, 0) / Math.max(1, boxes.length);
  return center < railLayout.articleCenterX ? 'left' : 'right';
}

function railGroupPreferredSide(group: PositionedAnnotationRailItem[]): AnnotationRailSide {
  let leftCount = 0;
  let rightCount = 0;
  for (const item of group) {
    if (item.preferredSide === 'left') leftCount += 1;
    if (item.preferredSide === 'right') rightCount += 1;
  }
  if (leftCount === rightCount) return group[0]?.preferredSide || 'right';
  return leftCount > rightCount ? 'left' : 'right';
}

function railGroupHasAnnotation(
  group: { group: PositionedAnnotationRailItem[] },
  annotationId: string,
) {
  return group.group.some((item) => item.annotation.id === annotationId);
}

function resolveRailGroupSides(
  railGroups: Array<{
    desiredTop: number;
    group: PositionedAnnotationRailItem[];
    height: number;
    side: AnnotationRailSide;
  }>,
  railLayout: AnnotationRailLayout | undefined,
): AnnotationRailSide[] {
  if (!railLayout || railLayout.mode === 'stacked') {
    return railGroups.map(() => 'right');
  }
  if (railLayout.mode === 'left' || railLayout.mode === 'right') {
    const side = railLayout.mode;
    return railGroups.map(() => side);
  }

  const sides: AnnotationRailSide[] = [];
  const sideBottoms: Record<'left' | 'right', number> = {
    left: Number.NEGATIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
  };
  for (const group of railGroups) {
    const preferredSide = group.side === 'left' ? 'left' : 'right';
    const side = (['left', 'right'] as const).toSorted((left, right) => {
      const leftCost = railSidePlacementCost(group, left, preferredSide, sideBottoms[left]);
      const rightCost = railSidePlacementCost(group, right, preferredSide, sideBottoms[right]);
      return leftCost - rightCost;
    })[0];
    sideBottoms[side] =
      Math.max(group.desiredTop, sideBottoms[side] + defaultRailSpacing.groupGap) + group.height;
    sides.push(side);
  }
  return sides;
}

function railSidePlacementCost(
  group: { desiredTop: number },
  side: 'left' | 'right',
  preferredSide: 'left' | 'right',
  sideBottom: number,
) {
  const displacedTop = Math.max(group.desiredTop, sideBottom + defaultRailSpacing.groupGap);
  const preferencePenalty = side === preferredSide ? 0 : 56;
  return displacedTop - group.desiredTop + preferencePenalty;
}

function mergeRailPressureGroups<
  T extends {
    anchorBottom: number;
    anchorTop: number;
    group: PositionedAnnotationRailItem[];
    desiredTop: number;
  },
>(
  railGroups: T[],
  groupSides: AnnotationRailSide[],
  activeId: string | null,
  noteHeights: Record<string, number>,
  viewport: RailViewportBounds | null,
) {
  const mergedRailGroups: Array<T & { height: number }> = [];
  const mergedGroupSides: AnnotationRailSide[] = [];

  railGroups.forEach((railGroup, index) => {
    const side = groupSides[index] || 'right';
    const previousIndex = mergedRailGroups.length - 1;
    const previousGroup = mergedRailGroups[previousIndex];
    const previousSide = mergedGroupSides[previousIndex];
    if (
      previousGroup &&
      previousSide === side &&
      railGroupsShouldStack(previousGroup, railGroup, viewport)
    ) {
      const group = [...previousGroup.group, ...railGroup.group].toSorted(
        (left, right) => left.top - right.top || left.index - right.index,
      );
      mergedRailGroups[previousIndex] = {
        ...previousGroup,
        anchorBottom: Math.max(previousGroup.anchorBottom, railGroup.anchorBottom),
        anchorTop: Math.min(previousGroup.anchorTop, railGroup.anchorTop),
        group,
        desiredTop: Math.min(previousGroup.desiredTop, railGroup.desiredTop),
        height: estimateRailGroupHeight(group, activeId, noteHeights),
      };
      return;
    }

    mergedRailGroups.push({
      ...railGroup,
      height: estimateRailGroupHeight(railGroup.group, activeId, noteHeights),
    });
    mergedGroupSides.push(side);
  });

  return { railGroups: mergedRailGroups, groupSides: mergedGroupSides };
}

function railGroupsShouldStack(
  previousGroup: { anchorBottom?: number; anchorTop?: number; desiredTop: number; height: number },
  railGroup: { anchorBottom?: number; anchorTop?: number; desiredTop: number },
  viewport: RailViewportBounds | null,
) {
  if (
    viewport &&
    railGroupNearViewport(previousGroup, viewport) !== railGroupNearViewport(railGroup, viewport)
  ) {
    return false;
  }
  return (
    railGroup.desiredTop <
    previousGroup.desiredTop + previousGroup.height + defaultRailSpacing.groupGap
  );
}

function resolveRailGroupSpacings(
  railGroups: Array<{
    desiredTop: number;
    group: Array<{ annotation: Annotation }>;
    height: number;
  }>,
  groupSides: AnnotationRailSide[],
  activeId: string | null,
  noteHeights: Record<string, number>,
  viewportTop = 0,
  viewportHeight = 0,
) {
  const spacings = railGroups.map(() => defaultRailSpacing);
  const viewport = railViewportBounds(viewportTop, viewportHeight);
  if (!viewport) return spacings;

  for (const side of ['left', 'right'] as const) {
    const indexes = groupSides
      .map((groupSide, index) => (groupSide === side ? index : -1))
      .filter((index) => index >= 0 && railGroupNearViewport(railGroups[index], viewport));
    if (indexes.length === 0) continue;

    const defaultHeight = railSideHeight(
      railGroups,
      indexes,
      defaultRailSpacing,
      activeId,
      noteHeights,
    );
    if (defaultHeight <= viewport.height) continue;

    const gapCompressionCapacity =
      indexes.length * (defaultRailSpacing.groupGap - minRailSpacing.groupGap);
    const gapShortage = defaultHeight - viewport.height;
    const groupGap =
      gapCompressionCapacity > 0
        ? defaultRailSpacing.groupGap -
          Math.min(gapShortage, gapCompressionCapacity) / indexes.length
        : defaultRailSpacing.groupGap;
    const compactGapSpacing = { ...defaultRailSpacing, groupGap };
    const compactGapHeight = railSideHeight(
      railGroups,
      indexes,
      compactGapSpacing,
      activeId,
      noteHeights,
    );
    if (compactGapHeight <= viewport.height) {
      applyRailSpacing(spacings, indexes, compactGapSpacing);
      continue;
    }

    const stackTopOffset = resolveCompactStackTopOffset(
      railGroups,
      indexes,
      groupGap,
      activeId,
      noteHeights,
      viewport.height,
    );
    const stackProgress =
      (defaultRailSpacing.stackTopOffset - stackTopOffset) /
      (defaultRailSpacing.stackTopOffset - minRailSpacing.stackTopOffset);
    applyRailSpacing(spacings, indexes, {
      groupGap,
      stackTopOffset,
      stackXOffset:
        defaultRailSpacing.stackXOffset -
        (defaultRailSpacing.stackXOffset - minRailSpacing.stackXOffset) * stackProgress,
    });
  }

  return spacings;
}

function applyRailSpacing(
  spacings: AnnotationRailSpacing[],
  indexes: number[],
  spacing: AnnotationRailSpacing,
) {
  for (const index of indexes) spacings[index] = spacing;
}

function railSideHeight(
  railGroups: Array<{ group: Array<{ annotation: Annotation }>; height: number }>,
  indexes: number[],
  spacing: AnnotationRailSpacing,
  activeId: string | null,
  noteHeights: Record<string, number>,
) {
  return indexes.reduce(
    (height, index) =>
      height +
      estimateRailGroupHeight(
        railGroups[index].group,
        activeId,
        noteHeights,
        spacing.stackTopOffset,
      ) +
      spacing.groupGap,
    0,
  );
}

function resolveCompactStackTopOffset(
  railGroups: Array<{ group: Array<{ annotation: Annotation }>; height: number }>,
  indexes: number[],
  groupGap: number,
  activeId: string | null,
  noteHeights: Record<string, number>,
  viewportHeight: number,
) {
  let low = minRailSpacing.stackTopOffset;
  let high = defaultRailSpacing.stackTopOffset;
  for (let step = 0; step < 8; step += 1) {
    const mid = (low + high) / 2;
    const height = railSideHeight(
      railGroups,
      indexes,
      { ...defaultRailSpacing, groupGap, stackTopOffset: mid },
      activeId,
      noteHeights,
    );
    if (height > viewportHeight) high = mid;
    else low = mid;
  }
  return low;
}

function resolveRailGroupTops(
  railGroups: Array<{ desiredTop: number; group: PositionedAnnotationRailItem[]; height: number }>,
  groupSides: AnnotationRailSide[],
  groupSpacings: AnnotationRailSpacing[],
  activeId: string | null,
  noteHeights: Record<string, number>,
  viewportTop = 0,
  viewportHeight = 0,
) {
  const groupTops = railGroups.map((group) => group.desiredTop);
  const viewport = railViewportBounds(viewportTop, viewportHeight);
  for (const side of ['left', 'right'] as const) {
    const indexes = groupSides
      .map((groupSide, index) => (groupSide === side ? index : -1))
      .filter((index) => index >= 0);
    const viewportIndexes = viewport
      ? indexes.filter((index) => railGroupNearViewport(railGroups[index], viewport))
      : indexes;
    resolveRailGroupTopsForSide(
      groupTops,
      railGroups,
      viewportIndexes,
      groupSpacings,
      viewport,
      activeId,
      noteHeights,
    );
  }
  return groupTops;
}

function resolveRailGroupTopsForSide(
  groupTops: number[],
  railGroups: Array<{ desiredTop: number; group: PositionedAnnotationRailItem[]; height: number }>,
  indexes: number[],
  groupSpacings: AnnotationRailSpacing[],
  viewport: RailViewportBounds | null,
  activeId: string | null,
  noteHeights: Record<string, number>,
) {
  const activeListIndex = activeId
    ? indexes.findIndex((index) => railGroupHasAnnotation(railGroups[index], activeId))
    : -1;
  if (activeListIndex >= 0) {
    anchorActiveRailGroup(
      groupTops,
      railGroups,
      indexes,
      activeListIndex,
      groupSpacings,
      viewport,
      activeId,
      noteHeights,
    );
    return;
  }

  pushRailGroupsDown(groupTops, railGroups, indexes, groupSpacings, viewport?.top ?? 0);
  if (viewport) pullRailGroupsIntoViewport(groupTops, railGroups, indexes, groupSpacings, viewport);
  pushRailGroupsDown(groupTops, railGroups, indexes, groupSpacings, viewport?.top ?? 0);
}

function anchorActiveRailGroup(
  groupTops: number[],
  railGroups: Array<{ desiredTop: number; group: PositionedAnnotationRailItem[]; height: number }>,
  indexes: number[],
  activeListIndex: number,
  groupSpacings: AnnotationRailSpacing[],
  viewport: RailViewportBounds | null,
  activeId: string | null,
  noteHeights: Record<string, number>,
) {
  const activeIndex = indexes[activeListIndex];
  const activeTop = activeId
    ? activeRailGroupTop(railGroups[activeIndex], activeId)
    : railGroups[activeIndex].desiredTop;
  const activeHeight = activeId
    ? activeRailGroupCardHeight(railGroups[activeIndex], activeId, noteHeights)
    : railGroups[activeIndex].height;
  groupTops[activeIndex] = clampRailGroupTop(activeTop, activeHeight, viewport);

  for (let listIndex = activeListIndex - 1; listIndex >= 0; listIndex -= 1) {
    const currentIndex = indexes[listIndex];
    const nextIndex = indexes[listIndex + 1];
    const nextGap = groupSpacings[nextIndex]?.groupGap ?? defaultRailSpacing.groupGap;
    const nextTop = groupTops[nextIndex] - railGroups[currentIndex].height - nextGap;
    groupTops[currentIndex] = Math.max(0, Math.min(groupTops[currentIndex], nextTop));
  }

  for (let listIndex = activeListIndex + 1; listIndex < indexes.length; listIndex += 1) {
    const previousIndex = indexes[listIndex - 1];
    const currentIndex = indexes[listIndex];
    const gap = groupSpacings[currentIndex]?.groupGap ?? defaultRailSpacing.groupGap;
    const previousBottom = groupTops[previousIndex] + railGroups[previousIndex].height + gap;
    groupTops[currentIndex] = Math.max(groupTops[currentIndex], previousBottom);
  }
}

function activeRailGroupTop(
  railGroup: { desiredTop: number; group: PositionedAnnotationRailItem[] },
  activeId: string,
) {
  return (
    railGroup.group.find((item) => item.annotation.id === activeId)?.top ?? railGroup.desiredTop
  );
}

function activeRailGroupCardHeight(
  railGroup: { group: PositionedAnnotationRailItem[]; height: number },
  activeId: string,
  noteHeights: Record<string, number>,
) {
  const activeItem = railGroup.group.find((item) => item.annotation.id === activeId);
  return activeItem ? annotationCardHeight(activeItem.annotation, noteHeights) : railGroup.height;
}

function clampRailGroupTop(
  desiredTop: number,
  height: number,
  viewport: RailViewportBounds | null,
) {
  if (!viewport) return desiredTop;
  const maxTop = Math.max(viewport.top, viewport.bottom - height - defaultRailSpacing.groupGap);
  return Math.max(viewport.top, Math.min(desiredTop, maxTop));
}

function pushRailGroupsDown(
  groupTops: number[],
  railGroups: Array<{ height: number }>,
  indexes: number[],
  groupSpacings: AnnotationRailSpacing[],
  minTop: number,
) {
  if (indexes.length === 0) return;
  groupTops[indexes[0]] = Math.max(minTop, groupTops[indexes[0]]);
  for (let listIndex = 1; listIndex < indexes.length; listIndex += 1) {
    const previousIndex = indexes[listIndex - 1];
    const currentIndex = indexes[listIndex];
    const gap = groupSpacings[currentIndex]?.groupGap ?? defaultRailSpacing.groupGap;
    const previousBottom = groupTops[previousIndex] + railGroups[previousIndex].height + gap;
    groupTops[currentIndex] = Math.max(minTop, groupTops[currentIndex], previousBottom);
  }
}

function pullRailGroupsIntoViewport(
  groupTops: number[],
  railGroups: Array<{ height: number }>,
  indexes: number[],
  groupSpacings: AnnotationRailSpacing[],
  viewport: RailViewportBounds,
) {
  if (indexes.length === 0) return;
  const lastIndex = indexes[indexes.length - 1];
  const gap = groupSpacings[lastIndex]?.groupGap ?? defaultRailSpacing.groupGap;
  const overflow = groupTops[lastIndex] + railGroups[lastIndex].height + gap - viewport.bottom;
  if (overflow > 0) {
    for (const index of indexes)
      groupTops[index] = Math.max(viewport.top, groupTops[index] - overflow);
  }

  for (let listIndex = indexes.length - 2; listIndex >= 0; listIndex -= 1) {
    const currentIndex = indexes[listIndex];
    const nextIndex = indexes[listIndex + 1];
    const nextGap = groupSpacings[nextIndex]?.groupGap ?? defaultRailSpacing.groupGap;
    const nextTop = groupTops[nextIndex] - railGroups[currentIndex].height - nextGap;
    groupTops[currentIndex] = Math.max(viewport.top, Math.min(groupTops[currentIndex], nextTop));
  }
}

type RailViewportBounds = {
  bottom: number;
  height: number;
  top: number;
};

function railViewportBounds(
  viewportTop: number,
  viewportHeight: number,
): RailViewportBounds | null {
  if (!Number.isFinite(viewportTop) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return null;
  }
  const top = Math.max(0, viewportTop);
  return {
    bottom: top + viewportHeight,
    height: viewportHeight,
    top,
  };
}

function railGroupNearViewport(
  railGroup: { anchorBottom?: number; anchorTop?: number; desiredTop: number },
  viewport: RailViewportBounds,
) {
  const anchorTop = railGroup.anchorTop ?? railGroup.desiredTop;
  const anchorBottom = railGroup.anchorBottom ?? railGroup.desiredTop;
  return (
    anchorTop <= viewport.bottom + railViewportOverscan &&
    anchorBottom >= viewport.top - railViewportOverscan
  );
}

function railGroupAnchorTop(group: PositionedAnnotationRailItem[]) {
  if (group.length === 0) return 0;
  return Math.min(...group.map((item) => item.rect?.top ?? item.top));
}

function railGroupAnchorBottom(group: PositionedAnnotationRailItem[]) {
  if (group.length === 0) return 0;
  return Math.max(...group.map((item) => item.rect?.bottom ?? item.top));
}

function estimateRailGroupHeight(
  group: Array<{ annotation: Annotation }>,
  activeId: string | null,
  noteHeights: Record<string, number>,
  stackTopOffset = defaultRailSpacing.stackTopOffset,
) {
  if (group.length === 0) return 176;

  const activeIndex = group.findIndex((item) => item.annotation.id === activeId);
  const frontIndex = activeIndex >= 0 ? activeIndex : 0;
  return Math.max(
    ...group.map((item, stackIndex) => {
      const stackDepth =
        group.length > 1 ? (stackIndex - frontIndex + group.length) % group.length : 0;
      return annotationCardHeight(item.annotation, noteHeights) + stackDepth * stackTopOffset;
    }),
  );
}

function estimateAnnotationCardHeight(annotation: Annotation) {
  const quoteLines = Math.max(1, Math.ceil(annotation.anchor.exact.length / 24));
  const primaryComment = annotationPrimaryComment(annotation)?.content || '';
  const commentLines = primaryComment
    ? Math.min(4, Math.max(1, Math.ceil(primaryComment.length / 28)))
    : 0;
  return 118 + quoteLines * 18 + commentLines * 24;
}

function annotationCardHeight(annotation: Annotation, noteHeights: Record<string, number>) {
  const measuredHeight = noteHeights[annotation.id];
  return measuredHeight && measuredHeight > 0
    ? measuredHeight
    : estimateAnnotationCardHeight(annotation);
}
