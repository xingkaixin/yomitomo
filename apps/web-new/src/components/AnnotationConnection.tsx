import { useEffect, useState } from 'react';
import { AnnotationConnection as ReaderAnnotationConnection } from '@yomitomo/reader-ui/reader-annotation-connection';
import type { ActiveConnection } from '@yomitomo/reader-ui/reader-types';
import { buildAnnotationConnectionPath } from '@yomitomo/reader-ui/reader-connection-path';

function computeConnection(annotationId: string): ActiveConnection | null {
  const highlight = document.querySelector<HTMLElement>(
    `[data-annotation-id="${annotationId}"]`,
  );
  const card = document.getElementById(`annotation-${annotationId}`);
  if (!highlight || !card) return null;

  const hRect = highlight.getBoundingClientRect();
  const cRect = card.getBoundingClientRect();

  const startX = hRect.right + 6;
  const startY = hRect.top + hRect.height / 2;
  const endX = cRect.left - 6;
  const endY = cRect.top + Math.min(72, cRect.height / 2);

  if (startX >= endX || hRect.bottom < 0 || hRect.top > window.innerHeight) return null;
  if (cRect.bottom < 0 || cRect.top > window.innerHeight) return null;

  const path = buildAnnotationConnectionPath(startX, startY, endX, endY);
  return { path, color: 'rgba(199, 164, 94, 0.55)' };
}

type AnnotationConnectionProps = {
  annotationId: string | null;
};

export default function AnnotationConnection({ annotationId }: AnnotationConnectionProps) {
  const [connection, setConnection] = useState<ActiveConnection | null>(null);

  useEffect(() => {
    if (!annotationId) {
      setConnection(null);
      return;
    }

    const update = () => setConnection(computeConnection(annotationId));
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
  }, [annotationId]);

  if (!connection) return null;

  return <ReaderAnnotationConnection connection={connection} />;
}
