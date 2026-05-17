import type React from 'react';
import type {
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  ArticleRecord,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentReadingIntentLabel,
  agentReadingIntentOptions,
  defaultMessageSendShortcut,
  defaultSelectionActionShortcuts,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';
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
  offsetFromArticleStart,
  timestamp,
  updateAnnotationComment,
} from '@yomitomo/core';
import type { ReaderReadingSection, ReaderSettings } from './reader-types';
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
  people: Array<AnnotationFilterOption<string>>;
  types: Array<AnnotationFilterOption<AnnotationType>>;
  actions: Array<AnnotationFilterOption<AgentReadingIntent>>;
  resultCount: number;
  activeCount: number;
};

export type AnnotationNavigationTargets = {
  previousId: string | null;
  nextId: string | null;
};

const annotationTypeOrder: AnnotationType[] = [
  'key_point',
  'assumption',
  'concept',
  'question',
  'quote',
];

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

export function buildReaderReadingSections(
  articleElement: HTMLElement,
  tocItems: TocItem[],
  articleTitle: string,
  bodySelector = '.reader-article-body',
): ReaderReadingSection[] {
  const body = articleElement.querySelector(bodySelector);
  const bodyStart = body ? offsetFromArticleStart(articleElement, body, 0) : 0;
  const articleText = articleElement.textContent || '';
  const bodyEnd = Math.max(bodyStart, articleText.length);
  const titleText = normalizeReaderHeadingText(articleTitle);
  const bodyTocItems = tocItems.filter(
    (item) => item.start >= bodyStart && normalizeReaderHeadingText(item.text) !== titleText,
  );
  const sectionDepth = bodyTocItems[0]?.depth;
  const sectionTocItems =
    sectionDepth === undefined ? [] : bodyTocItems.filter((item) => item.depth === sectionDepth);
  const sections: ReaderReadingSection[] = [];
  const firstSectionStart = sectionTocItems[0]
    ? clampSectionOffset(sectionTocItems[0].start, bodyStart, bodyEnd)
    : bodyEnd;

  if (readableSectionText(articleText, bodyStart, firstSectionStart)) {
    sections.push({
      id: 'intro',
      title: '引文',
      start: bodyStart,
      end: firstSectionStart,
    });
  }

  for (const item of sectionTocItems) {
    const start = clampSectionOffset(item.start, bodyStart, bodyEnd);
    const end = clampSectionOffset(item.end, start, bodyEnd);
    if (end <= start) continue;
    sections.push({
      id: `toc-${item.index}`,
      title: item.text,
      start,
      end,
    });
  }

  if (sections.length > 0) return sections;

  return [
    {
      id: 'body',
      title: '正文',
      start: bodyStart,
      end: bodyEnd,
    },
  ];
}

function readableSectionText(text: string, start: number, end: number) {
  return text.slice(start, end).trim().length > 0;
}

function normalizeReaderHeadingText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function clampSectionOffset(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
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
    return { ...filter, typeIds: toggleString(filter.typeIds, value) as AnnotationType[] };
  return { ...filter, actionIds: toggleString(filter.actionIds, value) as AgentReadingIntent[] };
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

export function annotationNavigationForReferenceIndex(
  annotations: Annotation[],
  referenceIndex: number,
): AnnotationNavigationTargets {
  if (referenceIndex < 0 || referenceIndex >= annotations.length) {
    return { previousId: null, nextId: null };
  }

  return {
    previousId: annotations[referenceIndex - 1]?.id ?? null,
    nextId: annotations[referenceIndex + 1]?.id ?? null,
  };
}

export function annotationNavigationForInsertionIndex(
  annotations: Annotation[],
  insertionIndex: number,
): AnnotationNavigationTargets {
  const boundedIndex = Math.max(0, Math.min(annotations.length, insertionIndex));
  return {
    previousId: annotations[boundedIndex - 1]?.id ?? null,
    nextId: annotations[boundedIndex]?.id ?? null,
  };
}

export function buildAnnotationFilterFacets(
  annotations: Annotation[],
  filter: AnnotationFilterState,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationFilterFacets {
  const resultCount = filterAnnotationsByFacets(annotations, filter).length;
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
    .filter((type) => annotations.some((annotation) => annotation.annotationType === type))
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
    .filter((option) => annotations.some((annotation) => annotation.readingIntent === option.value))
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

export type MessageSendShortcutKeyboardEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

export function getShortcutModifier() {
  return platformUsesMetaKey(navigatorPlatform()) ? '⌘' : 'Ctrl';
}

export function messageSendShortcutKeys(
  shortcut: MessageSendShortcut | undefined,
  modifier = getShortcutModifier(),
) {
  return normalizeMessageSendShortcut(shortcut) === 'mod-enter' ? [modifier, '⏎'] : ['⏎'];
}

export function isMessageSendShortcutEvent(
  event: MessageSendShortcutKeyboardEvent,
  shortcut: MessageSendShortcut | undefined = defaultMessageSendShortcut,
  platform = navigatorPlatform(),
) {
  if (event.nativeEvent?.isComposing || event.key !== 'Enter') return false;

  if (normalizeMessageSendShortcut(shortcut) === 'mod-enter') {
    return platformUsesMetaKey(platform) ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
  }

  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export type SelectionActionShortcut = 'annotate' | 'copy';

export type SelectionActionShortcutKeyboardEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

export function selectionActionShortcut(
  event: SelectionActionShortcutKeyboardEvent,
  shortcuts: Partial<SelectionActionShortcuts> = defaultSelectionActionShortcuts,
): SelectionActionShortcut | null {
  if (
    event.repeat ||
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return null;
  }

  const key = event.key.toUpperCase();
  const normalizedShortcuts = normalizeSelectionActionShortcuts(shortcuts);
  if (key === normalizedShortcuts.annotate) return 'annotate';
  if (key === normalizedShortcuts.copy) return 'copy';
  return null;
}

function navigatorPlatform() {
  return typeof navigator === 'undefined' ? '' : navigator.platform;
}

function platformUsesMetaKey(platform: string) {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
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
  const people = new Map<string, AnnotationFilterOption<string>>();
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

function toggleString<T extends string>(values: T[], value: string) {
  return values.includes(value as T)
    ? values.filter((item) => item !== value)
    : [...values, value as T];
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

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
