import type { HighlightBox } from '@yomitomo/core';
import type { FootnoteGroup } from '../annotations/annotation-footnotes';

type ReaderFootnotesProps = {
  activeId: string | null;
  endBoxByAnnotationId: ReadonlyMap<string, HighlightBox>;
  groups: readonly FootnoteGroup[];
  label: (ordinal: number) => string;
  onSelect: (annotationId: string) => void;
};

export function ReaderFootnotes({
  activeId,
  endBoxByAnnotationId,
  groups,
  label,
  onSelect,
}: ReaderFootnotesProps) {
  return (
    <div className="reader-footnote-layer">
      {groups.map((group) => {
        const box = group.annotationIds
          .map((id) => endBoxByAnnotationId.get(id))
          .find((candidate) => candidate !== undefined);
        if (!box) return null;
        const overflowActive =
          group.overflow !== null &&
          activeId !== null &&
          group.annotationIds.indexOf(activeId) >= group.entries.length;
        return (
          <span
            className="reader-footnote"
            key={group.key}
            style={{ left: box.left + box.width, top: box.top }}
          >
            {group.entries.map((entry) => (
              <button
                aria-current={entry.annotationId === activeId ? 'true' : undefined}
                aria-label={label(entry.ordinal)}
                className={
                  entry.distilled ? 'reader-footnote-mark is-distilled' : 'reader-footnote-mark'
                }
                key={entry.annotationId}
                type="button"
                onClick={() => onSelect(entry.annotationId)}
              >
                {entry.ordinal}
              </button>
            ))}
            {group.overflow ? (
              <button
                aria-current={overflowActive ? 'true' : undefined}
                aria-label={label(group.overflow.ordinal)}
                className="reader-footnote-mark is-overflow"
                type="button"
                onClick={() => group.overflow && onSelect(group.overflow.annotationId)}
              >
                +{group.overflow.count}
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** The footnote sits after the last line of a highlight: the lowest box, rightmost on that line. */
export function highlightEndBoxes(boxes: readonly HighlightBox[]) {
  const endBoxes = new Map<string, HighlightBox>();
  for (const box of boxes) {
    const current = endBoxes.get(box.annotationId);
    if (
      !current ||
      box.top > current.top ||
      (box.top === current.top && box.left + box.width > current.left + current.width)
    ) {
      endBoxes.set(box.annotationId, box);
    }
  }
  return endBoxes;
}
