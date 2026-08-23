import type {
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { agentReadingIntentLabel, agentReadingIntentOptions } from '@yomitomo/shared';
import { annotationPersona, annotationTypeLabel } from '@yomitomo/core';

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

function annotationPersonFilterId(annotation: Annotation) {
  if (annotation.author.kind === 'agent') {
    return `agent:${annotation.author.agentId}`;
  }
  return `user:${annotation.author.userId || annotation.author.username}`;
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
