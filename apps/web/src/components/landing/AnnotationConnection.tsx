import { useEffect, useState } from 'react';
import { AnnotationConnection as ReaderAnnotationConnection } from '@yomitomo/reader-ui/reader-annotation-connection';
import type { ActiveConnection } from '@yomitomo/reader-ui/reader-types';
import { buildAnnotationConnectionPath } from '@yomitomo/reader-ui/reader-connection-path';
import type { Annotation } from './data/article';
import { useLanding } from './LandingContext';

function computeConnection(
  annotationId: string,
  annotations: Annotation[],
): ActiveConnection | null {
  // Distillation cards anchor to a reused highlight via highlightId.
  const annotation = annotations.find((a) => a.id === annotationId);
  const highlightId = annotation?.highlightId ?? annotationId;
  const highlight = document.querySelector<HTMLElement>(`[data-annotation-id="${highlightId}"]`);
  const card = document.getElementById(`annotation-${annotationId}`);
  if (!highlight || !card) return null;

  const hRect = highlight.getBoundingClientRect();
  const cRect = card.getBoundingClientRect();

  // The card may sit on either side of the article; draw the line accordingly.
  const cardOnLeft = cRect.right <= hRect.left;
  const startX = cardOnLeft ? hRect.left - 6 : hRect.right + 6;
  const startY = hRect.top + hRect.height / 2;
  const endX = cardOnLeft ? cRect.right + 6 : cRect.left - 6;
  const endY = cRect.top + Math.min(72, cRect.height / 2);

  // Ensure the line actually points from the highlight toward the card.
  if (cardOnLeft ? endX >= startX : startX >= endX) return null;
  if (hRect.bottom < 0 || hRect.top > window.innerHeight) return null;
  if (cRect.bottom < 0 || cRect.top > window.innerHeight) return null;

  const path = buildAnnotationConnectionPath(startX, startY, endX, endY);
  return { path, color: 'rgba(44, 74, 124, 0.6)' };
}

type AnnotationConnectionProps = {
  annotationId: string | null;
};

export default function AnnotationConnection({ annotationId }: AnnotationConnectionProps) {
  const { annotations } = useLanding();
  const [connection, setConnection] = useState<ActiveConnection | null>(null);

  useEffect(() => {
    if (!annotationId) {
      setConnection(null);
      return;
    }

    // Connection lines only make sense when the annotation rail sits beside
    // the article (lg+). Below that the cards stack under the article, so a
    // line would shoot across the whole page.
    const update = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setConnection(null);
        return;
      }
      setConnection(computeConnection(annotationId, annotations));
    };
    update();

    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [annotationId, annotations]);

  if (!connection) return null;

  return <ReaderAnnotationConnection connection={connection} />;
}
