import { useCallback, useReducer, useRef } from 'react';
import type { ResolvedAppSettings } from '@yomitomo/shared';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { playAppSoundEffect } from '../../sound/app-sound-effects';

const annotationFeedbackDurationMs = 1200;

type RecentAnnotationFeedbackState = {
  newAnnotationIds: Set<string>;
  scopeKey: string;
};

type RecentAnnotationFeedbackEvent =
  | { type: 'annotationCreated'; annotationId: string; scopeKey: string }
  | { type: 'feedbackExpired'; annotationId: string; scopeKey: string }
  | { type: 'scopeChanged'; scopeKey: string };

function recentAnnotationFeedbackReducer(
  state: RecentAnnotationFeedbackState,
  event: RecentAnnotationFeedbackEvent,
): RecentAnnotationFeedbackState {
  switch (event.type) {
    case 'annotationCreated':
      if (event.scopeKey !== state.scopeKey) return state;
      return {
        ...state,
        newAnnotationIds: new Set(state.newAnnotationIds).add(event.annotationId),
      };
    case 'feedbackExpired': {
      if (event.scopeKey !== state.scopeKey || !state.newAnnotationIds.has(event.annotationId)) {
        return state;
      }
      const newAnnotationIds = new Set(state.newAnnotationIds);
      newAnnotationIds.delete(event.annotationId);
      return { ...state, newAnnotationIds };
    }
    case 'scopeChanged':
      return { newAnnotationIds: new Set(), scopeKey: event.scopeKey };
  }
}

export function useRecentAnnotationFeedback(scopeKey: string, settings?: ResolvedAppSettings) {
  const [state, dispatch] = useReducer(recentAnnotationFeedbackReducer, {
    newAnnotationIds: new Set<string>(),
    scopeKey,
  });
  const timersRef = useRef(new Map<string, number>());
  if (state.scopeKey !== scopeKey) dispatch({ type: 'scopeChanged', scopeKey });

  useMountEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
  });

  const markAnnotationCreated = useCallback(
    (annotationId: string) => {
      playAppSoundEffect('reader.annotation_created', settings);
      dispatch({ type: 'annotationCreated', annotationId, scopeKey });

      const existingTimer = timersRef.current.get(annotationId);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);

      const timer = window.setTimeout(() => {
        timersRef.current.delete(annotationId);
        dispatch({ type: 'feedbackExpired', annotationId, scopeKey });
      }, annotationFeedbackDurationMs);
      timersRef.current.set(annotationId, timer);
    },
    [scopeKey, settings],
  );

  return { markAnnotationCreated, newAnnotationIds: state.newAnnotationIds };
}
