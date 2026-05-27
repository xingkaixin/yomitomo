import type React from 'react';
import type {
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { agentReadingIntentLabel, agentReadingIntentOptions } from '@yomitomo/shared';
import {
  annotationColor,
  annotationPersona,
  annotationPrimaryComment,
  annotationTypeLabel,
  buildTocAnnotationStats as buildCoreTocAnnotationStats,
  buildHighlightSegments,
  highlightSegmentStyle,
  highlightStyle,
  isPrimaryTocItem,
  updateAnnotationComment,
} from '@yomitomo/core';
import type { HighlightBox, TocItem } from '@yomitomo/core';

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
  leftRailLeft: number;
  mode: 'both' | 'left' | 'right' | 'stacked';
  railWidth: number;
  rightRailLeft: number;
  viewportHeight?: number;
};

type PositionedAnnotationRailItem = {
  annotation: Annotation;
  index: number;
  preferredSide: AnnotationRailSide;
  start: number;
  end: number;
  top: number;
};

type HighlightBoxGroup = {
  boxes: HighlightBox[];
  minTop: number;
};

export type AnnotationFilterGroup = 'person' | 'type' | 'action';

export type AnnotationFilterState = {
  personIds: string[];
  typeIds: AnnotationType[];
  actionIds: AgentReadingIntent[];
};

export type AnnotationFilterOption<T extends string = string> = {
  id: T;
  label: string;
  count: number;
  selected: boolean;
  disabled: boolean;
  avatar?: string;
  fallback?: string;
  username?: string;
  color?: string;
};

export type AnnotationFilterFacets = {
  people: Array<AnnotationFilterOption>;
  types: Array<AnnotationFilterOption<AnnotationType>>;
  actions: Array<AnnotationFilterOption<AgentReadingIntent>>;
  resultCount: number;
  activeCount: number;
};

const annotationTypeOrder: AnnotationType[] = [
  'key_point',
  'assumption',
  'concept',
  'question',
  'quote',
];

export function agentQueueKey(annotation: Annotation) {
  return annotation.agentId || annotation.agentUsername || '__agent__';
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

export function createEmptyAnnotationFilter(): AnnotationFilterState {
  return { personIds: [], typeIds: [], actionIds: [] };
}

export function annotationFilterActiveCount(filter: AnnotationFilterState) {
  return filter.personIds.length + filter.typeIds.length + filter.actionIds.length;
}

export function isAnnotationFilterActive(filter: AnnotationFilterState) {
  return annotationFilterActiveCount(filter) > 0;
}

export function annotationFiltersEqual(left: AnnotationFilterState, right: AnnotationFilterState) {
  return (
    sameStrings(left.personIds, right.personIds) &&
    sameStrings(left.typeIds, right.typeIds) &&
    sameStrings(left.actionIds, right.actionIds)
  );
}

export function toggleAnnotationFilterValue(
  filter: AnnotationFilterState,
  group: AnnotationFilterGroup,
  value: string,
): AnnotationFilterState {
  if (group === 'person') return { ...filter, personIds: toggleString(filter.personIds, value) };
  if (group === 'type')
    return { ...filter, typeIds: toggleString(filter.typeIds, value as AnnotationType) };
  return { ...filter, actionIds: toggleString(filter.actionIds, value as AgentReadingIntent) };
}

export function pruneAnnotationFilter(
  filter: AnnotationFilterState,
  annotations: Annotation[],
): AnnotationFilterState {
  const personIds = new Set(annotations.map(annotationPersonFilterId));
  const typeIds = new Set(annotations.flatMap((annotation) => annotation.annotationType || []));
  const actionIds = new Set(annotations.flatMap((annotation) => annotation.readingIntent || []));
  return {
    personIds: filter.personIds.filter((id) => personIds.has(id)),
    typeIds: filter.typeIds.filter((id) => typeIds.has(id)),
    actionIds: filter.actionIds.filter((id) => actionIds.has(id)),
  };
}

export function filterAnnotationsByFacets(
  annotations: Annotation[],
  filter: AnnotationFilterState,
) {
  if (!isAnnotationFilterActive(filter)) return annotations;
  return annotations.filter((annotation) => annotationMatchesFilter(annotation, filter));
}

export function buildAnnotationFilterFacets(
  annotations: Annotation[],
  filter: AnnotationFilterState,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationFilterFacets {
  const resultCount = filterAnnotationsByFacets(annotations, filter).length;
  const presentTypeIds = new Set<AnnotationType>();
  const presentActionIds = new Set<AgentReadingIntent>();
  for (const annotation of annotations) {
    if (annotation.annotationType) presentTypeIds.add(annotation.annotationType);
    if (annotation.readingIntent) presentActionIds.add(annotation.readingIntent);
  }
  const personCounts = countFacetValues(annotations, filter, 'person', annotationPersonFilterId);
  const typeCounts = countFacetValues(
    annotations,
    filter,
    'type',
    (annotation) => annotation.annotationType || null,
  );
  const actionCounts = countFacetValues(
    annotations,
    filter,
    'action',
    (annotation) => annotation.readingIntent || null,
  );
  const people = buildPersonFilterOptions(annotations, filter, userProfile, agents, personCounts);
  const types = annotationTypeOrder
    .filter((type) => presentTypeIds.has(type))
    .map((type) => {
      const selected = filter.typeIds.includes(type);
      const count = typeCounts.get(type) || 0;
      return {
        id: type,
        label: annotationTypeLabel(type),
        count,
        selected,
        disabled: count === 0 && !selected,
      };
    });
  const actions = agentReadingIntentOptions
    .filter((option) => presentActionIds.has(option.value))
    .map((option) => {
      const selected = filter.actionIds.includes(option.value);
      const count = actionCounts.get(option.value) || 0;
      return {
        id: option.value,
        label: agentReadingIntentLabel(option.value),
        count,
        selected,
        disabled: count === 0 && !selected,
      };
    });

  return {
    people,
    types,
    actions,
    resultCount,
    activeCount: annotationFilterActiveCount(filter),
  };
}

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
      group.minTop = Math.min(group.minTop, box.top);
    } else {
      boxesByAnnotation.set(box.annotationId, { boxes: [box], minTop: box.top });
    }
  }

  const positioned = annotations
    .map((annotation, index) => {
      const boxGroup = boxesByAnnotation.get(annotation.id);
      const annotationBoxes = boxGroup?.boxes || [];
      const top =
        annotationBoxes.length > 0 && boxGroup
          ? Math.max(0, boxGroup.minTop - 10)
          : 120 + index * 150;
      return {
        annotation,
        index,
        preferredSide: annotationRailSide(annotationBoxes, railLayout),
        start: annotation.anchor.start,
        end: annotation.anchor.end,
        top,
      };
    })
    .toSorted((left, right) => left.top - right.top || left.index - right.index);

  const groups = buildAnnotationRailGroups(positioned);

  const railGroups = groups
    .map((group) =>
      group.toSorted((left, right) => left.top - right.top || left.index - right.index),
    )
    .map((group) => ({
      group,
      desiredTop: group[0]?.top || 0,
      height: estimateRailGroupHeight(group, activeId, noteHeights),
      side: railGroupPreferredSide(group),
    }))
    .toSorted((left, right) => left.desiredTop - right.desiredTop);

  const groupSides = resolveRailGroupSides(railGroups, railLayout);
  const groupTops = resolveRailGroupTops(railGroups, groupSides, railLayout?.viewportHeight);

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
      const style: React.CSSProperties = {
        top: groupTop + stackDepth * 42,
        zIndex: isActive ? 90 : isStackFront ? 40 : 10 + stackCount - stackDepth,
        '--stack-offset': `${Math.min(stackDepth, 4) * 14}px`,
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

export { buildHighlightSegments, highlightSegmentStyle, highlightStyle, isPrimaryTocItem };

function annotationPersonFilterId(annotation: Annotation) {
  if (annotation.author === 'ai') {
    return `agent:${annotation.agentId || annotation.agentUsername || annotation.id}`;
  }
  return `user:${annotation.userId || annotation.userUsername || annotation.author}`;
}

function annotationMatchesFilter(
  annotation: Annotation,
  filter: AnnotationFilterState,
  ignoredGroup?: AnnotationFilterGroup,
) {
  const personMatch =
    ignoredGroup === 'person' ||
    filter.personIds.length === 0 ||
    filter.personIds.includes(annotationPersonFilterId(annotation));
  const typeMatch =
    ignoredGroup === 'type' ||
    filter.typeIds.length === 0 ||
    (annotation.annotationType ? filter.typeIds.includes(annotation.annotationType) : false);
  const actionMatch =
    ignoredGroup === 'action' ||
    filter.actionIds.length === 0 ||
    (annotation.readingIntent ? filter.actionIds.includes(annotation.readingIntent) : false);
  return personMatch && typeMatch && actionMatch;
}

function countFacetValues(
  annotations: Annotation[],
  filter: AnnotationFilterState,
  ignoredGroup: AnnotationFilterGroup,
  getValue: (annotation: Annotation) => string | null,
) {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    if (!annotationMatchesFilter(annotation, filter, ignoredGroup)) continue;
    const value = getValue(annotation);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function buildPersonFilterOptions(
  annotations: Annotation[],
  filter: AnnotationFilterState,
  userProfile: UserProfile,
  agents: PublicAgent[],
  counts: Map<string, number>,
) {
  const people = new Map<string, AnnotationFilterOption>();
  for (const annotation of annotations) {
    const id = annotationPersonFilterId(annotation);
    if (people.has(id)) continue;
    const persona = annotationPersona(annotation, userProfile, agents);
    const selected = filter.personIds.includes(id);
    const count = counts.get(id) || 0;
    people.set(id, {
      id,
      label: persona.nickname,
      username: persona.username,
      avatar: persona.avatar,
      fallback: persona.fallback,
      color: persona.color,
      count,
      selected,
      disabled: count === 0 && !selected,
    });
  }
  return Array.from(people.values());
}

function toggleString<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function buildAnnotationRailGroups(positioned: PositionedAnnotationRailItem[]) {
  const sorted = [...positioned].toSorted(
    (left, right) => left.start - right.start || left.end - right.end || left.index - right.index,
  );
  const groups: PositionedAnnotationRailItem[][] = [];
  let currentGroup: PositionedAnnotationRailItem[] = [];
  let currentEnd = Number.NEGATIVE_INFINITY;

  for (const item of sorted) {
    if (currentGroup.length === 0 || item.start >= currentEnd) {
      currentGroup = [item];
      groups.push(currentGroup);
      currentEnd = item.end;
      continue;
    }

    currentGroup.push(item);
    currentEnd = Math.max(currentEnd, item.end);
  }

  return groups;
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

function resolveRailGroupSides(
  railGroups: Array<{ desiredTop: number; height: number; side: AnnotationRailSide }>,
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
    sideBottoms[side] = Math.max(group.desiredTop, sideBottoms[side] + 18) + group.height;
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
  const displacedTop = Math.max(group.desiredTop, sideBottom + 18);
  const preferencePenalty = side === preferredSide ? 0 : 56;
  return displacedTop - group.desiredTop + preferencePenalty;
}

function resolveRailGroupTops(
  railGroups: Array<{ desiredTop: number; height: number }>,
  groupSides: AnnotationRailSide[],
  viewportHeight = 0,
) {
  const groupTops = railGroups.map((group) => group.desiredTop);
  const viewportBottom = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;
  for (const side of ['left', 'right'] as const) {
    const indexes = groupSides
      .map((groupSide, index) => (groupSide === side ? index : -1))
      .filter((index) => index >= 0);
    for (let listIndex = 1; listIndex < indexes.length; listIndex += 1) {
      const previousIndex = indexes[listIndex - 1];
      const currentIndex = indexes[listIndex];
      const previousBottom = groupTops[previousIndex] + railGroups[previousIndex].height + 18;
      groupTops[currentIndex] = Math.max(groupTops[currentIndex], previousBottom);
    }
    for (let listIndex = indexes.length - 2; listIndex >= 0; listIndex -= 1) {
      const currentIndex = indexes[listIndex];
      const nextIndex = indexes[listIndex + 1];
      const nextTop = groupTops[nextIndex] - railGroups[currentIndex].height - 18;
      groupTops[currentIndex] = Math.max(0, Math.min(groupTops[currentIndex], nextTop));
    }
    if (viewportBottom > 0) {
      for (const index of indexes) {
        const maxTop = Math.max(0, viewportBottom - railGroups[index].height - 18);
        groupTops[index] = Math.max(0, Math.min(groupTops[index], maxTop));
      }
    }
  }
  return groupTops;
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
