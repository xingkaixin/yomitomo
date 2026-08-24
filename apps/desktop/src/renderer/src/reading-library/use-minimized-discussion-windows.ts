import { useEffect, useMemo, useState } from 'react';
import type {
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowStateEvent,
} from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

export function useMinimizedDiscussionWindows(articleId: string | null) {
  const [windows, setWindows] = useState<AnnotationDiscussionWindowState[]>([]);

  useEffect(() => {
    const subscribe = getOptionalDesktopApi()?.annotations?.onDiscussionWindowState;
    if (!subscribe) return;
    return subscribe((event) =>
      setWindows((current) => applyDiscussionWindowEvent(current, event)),
    );
  }, []);

  return useMemo(
    () => (articleId ? windows.filter((window) => window.articleId === articleId) : []),
    [articleId, windows],
  );
}

export function applyDiscussionWindowEvent(
  windows: AnnotationDiscussionWindowState[],
  event: AnnotationDiscussionWindowStateEvent,
) {
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
