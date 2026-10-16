import { useEffect, useEffectEvent } from 'react';
import { getOptionalDesktopApi } from '../../shell/app-desktop-api';

// Passage links in assistant replies, from the reader chat or a discussion window, land here.
export function useAssistantPassageReveal(
  articleId: string,
  reveal: (start: number, end: number) => void,
) {
  const revealPassage = useEffectEvent(reveal);
  useEffect(
    () =>
      getOptionalDesktopApi()?.assistant?.onRevealPassage?.((request) => {
        if (request.articleId === articleId) revealPassage(request.start, request.end);
      }),
    [articleId],
  );
}
