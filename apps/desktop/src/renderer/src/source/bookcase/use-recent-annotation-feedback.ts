import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@yomitomo/shared';
import { playAppSoundEffect } from '../../sound/app-sound-effects';

const annotationFeedbackDurationMs = 1200;

export function useRecentAnnotationFeedback(scopeKey: string, settings?: AppSettings) {
  const [newAnnotationIds, setNewAnnotationIds] = useState<Set<string>>(() => new Set());
  const timersRef = useRef(new Map<string, number>());

  const clearAll = useCallback(() => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
    setNewAnnotationIds(new Set());
  }, []);

  useEffect(() => {
    clearAll();
    return clearAll;
  }, [clearAll, scopeKey]);

  const markAnnotationCreated = useCallback(
    (annotationId: string) => {
      playAppSoundEffect('reader.annotation_created', settings || {});
      setNewAnnotationIds((current) => new Set(current).add(annotationId));

      const existingTimer = timersRef.current.get(annotationId);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);

      const timer = window.setTimeout(() => {
        timersRef.current.delete(annotationId);
        setNewAnnotationIds((current) => {
          if (!current.has(annotationId)) return current;
          const next = new Set(current);
          next.delete(annotationId);
          return next;
        });
      }, annotationFeedbackDurationMs);
      timersRef.current.set(annotationId, timer);
    },
    [settings],
  );

  return { markAnnotationCreated, newAnnotationIds };
}
