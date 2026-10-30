import { getOptionalDesktopApi } from '../../shell/app-desktop-api';
import { useDesktopEvent } from '../../shell/use-desktop-event';

// Passage links in assistant replies, from the reader chat or a discussion window, land here.
export function useAssistantPassageReveal(
  articleId: string,
  reveal: (start: number, end: number) => void,
) {
  useDesktopEvent(getOptionalDesktopApi()?.assistant?.onRevealPassage, (request) => {
    if (request.articleId === articleId) reveal(request.start, request.end);
  });
}
