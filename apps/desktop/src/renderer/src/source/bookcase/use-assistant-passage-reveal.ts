import { createElement, useCallback, useReducer, useRef, useSyncExternalStore } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { getOptionalDesktopApi } from '../../shell/app-desktop-api';
import { useOptionalAppSessionStoreApi, type PendingPassageReveal } from '../../shell/app-session';
import { useDesktopEvent } from '../../shell/use-desktop-event';

export type PassageFlashBox = Omit<HighlightBox, 'annotationId' | 'color' | 'contributorId'>;

const PASSAGE_FLASH_DURATION_MS = 1650;
const emptyFlashBoxes: HighlightBox[] = [];
const subscribeToNothing = () => () => undefined;

type PassageFlashState = {
  boxes: HighlightBox[];
  scopeKey: string;
  token: number;
};

type PassageFlashEvent =
  | { type: 'cleared'; token: number }
  | { type: 'flashed'; boxes: HighlightBox[]; scopeKey: string; token: number }
  | { type: 'scopeChanged'; scopeKey: string };

function passageFlashReducer(
  state: PassageFlashState,
  event: PassageFlashEvent,
): PassageFlashState {
  switch (event.type) {
    case 'cleared':
      return state.token === event.token && state.boxes.length > 0
        ? { ...state, boxes: emptyFlashBoxes }
        : state;
    case 'flashed':
      return event.scopeKey === state.scopeKey
        ? { boxes: event.boxes, scopeKey: state.scopeKey, token: event.token }
        : state;
    case 'scopeChanged':
      return { boxes: emptyFlashBoxes, scopeKey: event.scopeKey, token: state.token + 1 };
  }
}

// Passage links in assistant replies, from the reader chat or a discussion window, land here.
export function useAssistantPassageReveal({
  articleId,
  ready = true,
  reveal,
}: {
  articleId: string;
  ready?: boolean;
  reveal: (
    start: number,
    end: number,
  ) => PassageFlashBox[] | Promise<PassageFlashBox[]> | void | Promise<void>;
}) {
  const sessionStore = useOptionalAppSessionStoreApi();
  const pendingReveal = useSyncExternalStore(
    sessionStore ? sessionStore.subscribe : subscribeToNothing,
    () => sessionStore?.getState().pendingRevealPassage ?? null,
  );
  const [flashState, dispatchFlash] = useReducer(passageFlashReducer, {
    boxes: emptyFlashBoxes,
    scopeKey: articleId,
    token: 0,
  });
  if (flashState.scopeKey !== articleId) {
    dispatchFlash({ type: 'scopeChanged', scopeKey: articleId });
  }

  const requestCounterRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const readReveal = useStableCallback(reveal);

  useMountEffect(() => () => {
    requestCounterRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  });

  const triggerReveal = useStableCallback((start: number, end: number) => {
    const token = ++requestCounterRef.current;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void Promise.resolve(readReveal(start, end))
      .then((rawBoxes) => {
        if (token !== requestCounterRef.current || !rawBoxes || rawBoxes.length === 0) return;
        const boxes: HighlightBox[] = rawBoxes.map((box, index) => ({
          ...box,
          id: `${box.id}-${token}-${index}`,
          annotationId: '__passage_flash__',
          color: 'var(--app-reader-primary)',
          contributorId: '__passage_flash__',
        }));
        dispatchFlash({ type: 'flashed', boxes, scopeKey: articleId, token });
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          dispatchFlash({ type: 'cleared', token });
        }, PASSAGE_FLASH_DURATION_MS);
      })
      .catch(() => undefined);
  });

  // Fallback for isolated views mounted without AppSessionStoreProvider.
  useDesktopEvent(
    sessionStore ? undefined : getOptionalDesktopApi()?.assistant?.onRevealPassage,
    (request) => {
      if (request.articleId === articleId && ready) triggerReveal(request.start, request.end);
    },
  );

  const matchingPending: PendingPassageReveal | null =
    ready && pendingReveal && pendingReveal.articleId === articleId ? pendingReveal : null;
  const readMatchingPending = useStableCallback(() => matchingPending);

  const attachPendingReveal = useCallback(
    (marker: HTMLElement | null) => {
      const request = readMatchingPending();
      if (!marker || !request) return;
      sessionStore?.getState().actions.consumePendingRevealPassage(request.token);
      triggerReveal(request.start, request.end);
    },
    [sessionStore],
  );

  return {
    flashBoxes: flashState.boxes,
    marker: matchingPending
      ? createElement('span', {
          hidden: true,
          key: `${articleId}:${matchingPending.token}`,
          ref: attachPendingReveal,
        })
      : null,
  };
}
