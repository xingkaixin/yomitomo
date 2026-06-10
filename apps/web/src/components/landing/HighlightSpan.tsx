import { useCallback } from 'react';

type HighlightSpanProps = {
  children: string;
  annotationId: string;
  activeAnnotationId: string | null;
  onActivate: (id: string | null) => void;
};

export default function HighlightSpan({
  children,
  annotationId,
  activeAnnotationId,
  onActivate,
}: HighlightSpanProps) {
  const isActive = activeAnnotationId === annotationId;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onActivate(annotationId);
      // The desktop rail and the mobile stack both render a card with this id,
      // but only one is visible per layout. Scroll to the visible one so the
      // click always lands somewhere (offsetParent is null when display:none).
      const cards = document.querySelectorAll<HTMLElement>(`[id="annotation-${annotationId}"]`);
      const card = Array.from(cards).find((el) => el.offsetParent !== null) ?? cards[0];
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [annotationId, onActivate],
  );

  return (
    <mark
      className={`reader-highlight${isActive ? ' is-active' : ''}`}
      data-annotation-id={annotationId}
      onClick={handleClick}
    >
      {children}
    </mark>
  );
}
