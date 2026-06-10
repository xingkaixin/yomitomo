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
      const card = document.getElementById(`annotation-${annotationId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
