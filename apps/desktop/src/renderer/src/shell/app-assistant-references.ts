import type { MouseEvent } from 'react';
import { parseAssistantReference } from '@yomitomo/shared';
import { getOptionalDesktopApi } from './app-desktop-api';

export function openAssistantReference(articleId: string, href: string) {
  const reference = parseAssistantReference(href);
  if (!reference) return false;
  const api = getOptionalDesktopApi();
  const opening =
    reference.kind === 'passage'
      ? api?.assistant?.revealPassage?.({ articleId, start: reference.start, end: reference.end })
      : api?.annotations?.discussion?.open?.({ articleId, annotationId: reference.annotationId });
  void opening?.catch((error: unknown) => {
    console.warn('[assistant] reference open failed', { articleId, href, error });
  });
  return true;
}

// Reference links live inside rendered markdown, so the click is caught on its container.
export function openAssistantReferenceFromClick(event: MouseEvent<HTMLElement>, articleId: string) {
  const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
  const href = link?.getAttribute('href');
  if (href && openAssistantReference(articleId, href)) event.preventDefault();
}
