import type { HighlightBox } from '@yomitomo/core';

export const WEB_ANNOTATION_RAIL_DEBUG_STORAGE_KEY = 'yomitomo:web-annotation-rail-debug';
export const WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS = 80;
export const WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN = 96;
export const WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT = 12;

export type AnnotationRailDebugBoxGroup = {
  bottom: number;
  top: number;
};

export function webAnnotationRailDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoWebAnnotationRailDebug?: boolean })
        .yomitomoWebAnnotationRailDebug === true ||
      window.localStorage.getItem(WEB_ANNOTATION_RAIL_DEBUG_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function annotationRailDebugNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export function annotationRailDebugRect(rect: DOMRect | DOMRectReadOnly | undefined | null) {
  if (!rect) return null;
  return {
    bottom: annotationRailDebugNumber(rect.bottom),
    height: annotationRailDebugNumber(rect.height),
    left: annotationRailDebugNumber(rect.left),
    right: annotationRailDebugNumber(rect.right),
    top: annotationRailDebugNumber(rect.top),
    width: annotationRailDebugNumber(rect.width),
  };
}

export function annotationRailDebugStyleNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function annotationRailDebugBoxGroups(boxes: HighlightBox[]) {
  const groups = new Map<string, AnnotationRailDebugBoxGroup>();
  for (const box of boxes) {
    const group = groups.get(box.annotationId);
    const bottom = box.top + box.height;
    if (group) {
      group.top = Math.min(group.top, box.top);
      group.bottom = Math.max(group.bottom, bottom);
    } else {
      groups.set(box.annotationId, { bottom, top: box.top });
    }
  }
  return groups;
}
