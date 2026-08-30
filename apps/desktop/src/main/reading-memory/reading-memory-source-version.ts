import { createHash } from 'node:crypto';
import type { ReadingReviewFold } from '@yomitomo/shared';

type PersistedSourceRow = Readonly<Record<string, unknown>> & { readonly id: string };

const annotationThreadSourceFormat = 'reading-memory:annotation-thread:v2';

export function annotationThreadSourceVersion(
  annotation: PersistedSourceRow,
  comments: readonly PersistedSourceRow[],
  reviews?: ReadonlyMap<string, ReadingReviewFold>,
) {
  return sourceVersion({
    format: annotationThreadSourceFormat,
    operation: 'upsert',
    annotation,
    comments: comments.toSorted(comparePersistedRows),
    reviews: [...(reviews ?? [])].toSorted(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  });
}

export function deletedAnnotationThreadSourceVersion(annotationId: string) {
  return sourceVersion({
    format: annotationThreadSourceFormat,
    operation: 'delete',
    annotationId,
  });
}

function sourceVersion(source: Record<string, unknown>) {
  const serialized = JSON.stringify(canonicalValue(source));
  if (serialized === undefined) throw new TypeError('Reading memory source is not serializable');
  return createHash('sha256').update(serialized).digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;

  return Object.keys(value)
    .toSorted()
    .reduce<Record<string, unknown>>((canonical, key) => {
      canonical[key] = canonicalValue(Reflect.get(value, key));
      return canonical;
    }, {});
}

function comparePersistedRows(left: PersistedSourceRow, right: PersistedSourceRow) {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}
