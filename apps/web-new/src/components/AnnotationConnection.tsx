import { useEffect, useState } from 'react';

function computePath(annotationId: string): string | null {
  const highlight = document.querySelector<HTMLElement>(
    `[data-annotation-id="${annotationId}"]`,
  );
  const card = document.getElementById(`annotation-${annotationId}`);
  if (!highlight || !card) return null;

  const hRect = highlight.getBoundingClientRect();
  const cRect = card.getBoundingClientRect();

  const startX = hRect.right;
  const startY = hRect.top + hRect.height / 2;
  const endX = cRect.left;
  const endY = cRect.top + cRect.height / 2;

  // Not visible
  if (startX >= endX || startY < 0 || endY < 0) return null;

  const midX = (startX + endX) / 2;
  const d = `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${midX.toFixed(1)} ${startY.toFixed(1)}, ${midX.toFixed(1)} ${endY.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  return d;
}

type AnnotationConnectionProps = {
  annotationId: string | null;
};

export default function AnnotationConnection({
  annotationId,
}: AnnotationConnectionProps) {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!annotationId) {
      setPath(null);
      return;
    }

    const update = () => {
      setPath(computePath(annotationId));
    };

    update();
    const interval = setInterval(update, 80);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [annotationId]);

  if (!annotationId || !path) return null;

  return (
    <svg className="annotation-connection" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
