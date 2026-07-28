/**
 * One annotation can produce several highlight segments, so a per-segment scan of the
 * annotation list is quadratic on every render. Index once, look up per segment.
 */
export function annotationOrdinalsById(annotations: readonly { id: string }[]) {
  const ordinals = new Map<string, number>();
  for (const [index, annotation] of annotations.entries()) {
    // A duplicate id keeps its first position; normalizing the data is not render's job.
    if (!ordinals.has(annotation.id)) ordinals.set(annotation.id, index + 1);
  }
  return ordinals;
}

export function highlightDiscussionLabel(ordinal: number | undefined) {
  return ordinal ? `打开引文讨论 ${ordinal}` : '打开引文讨论';
}
