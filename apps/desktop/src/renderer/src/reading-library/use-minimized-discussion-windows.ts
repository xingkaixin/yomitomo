import { useMemo, useReducer } from 'react';
import type {
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowStateEvent,
} from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';
import { useDesktopEvent } from '../shell/use-desktop-event';

export function useMinimizedDiscussionWindows(articleId: string | null) {
  const [windows, dispatch] = useReducer(applyDiscussionWindowEvent, []);

  useDesktopEvent(getOptionalDesktopApi()?.annotations?.onDiscussionWindowState, dispatch);

  return useMemo(
    () => (articleId ? windows.filter((window) => window.articleId === articleId) : []),
    [articleId, windows],
  );
}

export function applyDiscussionWindowEvent(
  windows: AnnotationDiscussionWindowState[],
  event: AnnotationDiscussionWindowStateEvent,
): AnnotationDiscussionWindowState[] {
  if (event.type === 'remove') {
    return windows.filter(
      (window) =>
        window.articleId !== event.articleId || window.annotationId !== event.annotationId,
    );
  }
  const next = event.window;
  const rest = windows.filter(
    (window) => window.articleId !== next.articleId || window.annotationId !== next.annotationId,
  );
  return next.minimized ? [...rest, next] : rest;
}
