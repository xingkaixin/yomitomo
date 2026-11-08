import type { Annotation } from '@yomitomo/shared';

export type FootnoteEntry = {
  annotationId: string;
  ordinal: number;
  distilled: boolean;
};

export type FootnoteGroup = {
  key: string;
  annotationIds: string[];
  entries: FootnoteEntry[];
  overflow: { annotationId: string; ordinal: number; count: number } | null;
};

type FootnoteSource = Pick<Annotation, 'id' | 'distillation'> & {
  anchor: Pick<Annotation['anchor'], 'end' | 'chapterId' | 'segmentId'>;
};

const maxEntriesWithoutOverflow = 3;
const entriesBeforeOverflow = 2;

/** Highlights that end at the same text position share one footnote pill, ordered by ordinal. */
export function buildFootnoteGroups(
  annotations: readonly FootnoteSource[],
  ordinalById: ReadonlyMap<string, number>,
): FootnoteGroup[] {
  const entriesByKey = new Map<string, FootnoteEntry[]>();
  for (const annotation of annotations) {
    const ordinal = ordinalById.get(annotation.id);
    if (ordinal === undefined) continue;
    const { chapterId = '', segmentId = '', end } = annotation.anchor;
    const key = `${chapterId}|${segmentId}|${end}`;
    const entry = {
      annotationId: annotation.id,
      ordinal,
      distilled: annotation.distillation?.status === 'published',
    };
    const entries = entriesByKey.get(key);
    if (entries) entries.push(entry);
    else entriesByKey.set(key, [entry]);
  }

  return [...entriesByKey].map(([key, entries]) => {
    const ordered = entries.toSorted((left, right) => left.ordinal - right.ordinal);
    const collapsed = ordered.length > maxEntriesWithoutOverflow;
    const hidden = collapsed ? ordered.slice(entriesBeforeOverflow) : [];
    return {
      key,
      annotationIds: ordered.map((entry) => entry.annotationId),
      entries: collapsed ? ordered.slice(0, entriesBeforeOverflow) : ordered,
      overflow: hidden[0]
        ? { annotationId: hidden[0].annotationId, ordinal: hidden[0].ordinal, count: hidden.length }
        : null,
    };
  });
}
