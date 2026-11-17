import { useMemo, useReducer } from 'react';
import { flushSync } from 'react-dom';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import type {
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowStateEvent,
} from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';
import { useDesktopEvent } from '../shell/use-desktop-event';
import {
  animateDiscussionWindow,
  clearDiscussionWindowPreviews,
} from './discussion-window-transition';

export function useMinimizedDiscussionWindows(articleId: string | null) {
  const [windows, dispatch] = useReducer(applyDiscussionWindowEvent, []);
  useMountEffect(() => clearDiscussionWindowPreviews);

  useDesktopEvent(getOptionalDesktopApi()?.annotations?.onDiscussionWindowState, (event) => {
    // The next IPC event measures the capsule before the native window is hidden.
    flushSync(() => dispatch(event));
  });
  useDesktopEvent(getOptionalDesktopApi()?.annotations?.discussion?.onTransition, (event) => {
    void animateDiscussionWindow(event).catch(() => undefined);
  });

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
