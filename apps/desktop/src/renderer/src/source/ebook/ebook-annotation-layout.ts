import {
  defaultUserAnnotationColor,
  hashText,
  type Annotation,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import { annotationColor } from '@yomitomo/core';
import { normalizeRenderedText } from './ebook-text-anchor';

export type EbookBoxUpdateReason =
  | 'annotation_navigation'
  | 'annotations_applied'
  | 'annotations_saved'
  | 'layout_effect'
  | 'layout_measure'
  | 'open_ebook'
  | 'page_turn'
  | 'reader_settings'
  | 'relocate'
  | 'resize_observer'
  | 'translation';

export type EbookBoxScheduleState = {
  count: number;
  cancelledFrameCount: number;
  reasons: EbookBoxUpdateReason[];
  firstScheduledAt: number;
};

export type EbookBoxScheduleSnapshot = {
  count: number;
  cancelledFrameCount: number;
  reasons: EbookBoxUpdateReason[];
  delayMs: number;
};

export function ebookHighlightAnnotationsSignature(
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return hashText(
    annotations
      .map((annotation) => {
        const anchor = annotation.anchor;
        return [
          annotation.id,
          anchor.chapterId || '',
          anchor.segmentId || '',
          anchor.paragraphId || '',
          anchor.textStartInBook ?? '',
          anchor.textEndInBook ?? '',
          anchor.textStartInParagraph ?? '',
          anchor.textEndInParagraph ?? '',
          anchor.start,
          anchor.end,
          hashText(normalizeRenderedText(anchor.exact)),
          hashText(normalizeRenderedText(anchor.prefix || '')),
          hashText(normalizeRenderedText(anchor.suffix || '')),
          annotation.author.kind === 'agent'
            ? annotation.author.agentId
            : annotation.author.userId || annotation.author.username,
          annotationColor(annotation, userProfile, agents),
        ].join(':');
      })
      .toSorted()
      .join('|'),
  );
}

export function foliateRangeHighlightBoxes(range: Range, canvasRect: DOMRect, idPrefix: string) {
  return mappedFoliateRangeRects(range, canvasRect).map((rect, index) => ({
    id: `${idPrefix}_${index}`,
    annotationId: '',
    color: defaultUserAnnotationColor,
    top: rect.top - canvasRect.top,
    left: rect.left - canvasRect.left,
    width: rect.width,
    height: rect.height,
  }));
}

export function lastFoliateRangeViewportRect(range: Range, canvasRect: DOMRect) {
  return mappedFoliateRangeRects(range, canvasRect).at(-1) || null;
}

export function mappedFoliateRangeRects(range: Range, canvasRect: DOMRect) {
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
  if (!(frame instanceof HTMLIFrameElement)) return [];

  const frameRect = frame.getBoundingClientRect();
  const viewportRect = foliateFrameViewportRect(frame, canvasRect);
  if (!viewportRect) return [];

  return Array.from(range.getClientRects()).flatMap((rect) => {
    const left = frameRect.left + rect.left;
    const top = frameRect.top + rect.top;
    const right = left + rect.width;
    const bottom = top + rect.height;
    const visibleLeft = Math.max(left, viewportRect.left);
    const visibleTop = Math.max(top, viewportRect.top);
    const visibleRight = Math.min(right, viewportRect.right);
    const visibleBottom = Math.min(bottom, viewportRect.bottom);
    const width = visibleRight - visibleLeft;
    const height = visibleBottom - visibleTop;
    return width >= 2 && height >= 2 ? [new DOMRect(visibleLeft, visibleTop, width, height)] : [];
  });
}

function foliateFrameViewportRect(frame: HTMLIFrameElement, canvasRect: DOMRect) {
  const root = frame.getRootNode();
  const host = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot ? root.host : null;
  const hostRect = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
  return intersectRects(frame.getBoundingClientRect(), hostRect || canvasRect, canvasRect);
}

function intersectRects(...rects: DOMRect[]): DOMRect | null {
  const left = Math.max(...rects.map((rect) => rect.left));
  const top = Math.max(...rects.map((rect) => rect.top));
  const right = Math.min(...rects.map((rect) => rect.right));
  const bottom = Math.min(...rects.map((rect) => rect.bottom));
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : null;
}
