import type { Annotation } from '@yomitomo/shared';
import {
  isRangeInsideArticle,
  offsetFromArticleStart,
  offsetFromArticleStartIgnoringSelector,
  translationElementForRange,
  type HighlightBox,
} from '@yomitomo/core';

export const READER_SELECTION_DEBUG_STORAGE_KEY = 'yomitomo:reader-selection-debug';

export type ReaderSelectionDebugDetails = () => Record<string, unknown>;

export function readerSelectionDebugEnabled() {
  if (import.meta.env.VITE_YOMITOMO_READER_SELECTION_DEBUG === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(READER_SELECTION_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function logReaderSelectionDebug(event: string, readDetails: ReaderSelectionDebugDetails) {
  if (!readerSelectionDebugEnabled()) return;
  const details = readDetails();
  console.debug('[reader-selection]', event, details);
  if (typeof window === 'undefined') return;
  const recordTiming = window.yomitomoDesktop?.recordPerformanceTiming;
  if (!recordTiming) return;
  void recordTiming({
    event: `reader_selection.${selectionDebugEventName(event)}`,
    data: details,
  }).catch(() => undefined);
}

export function shouldLogSelectionDebug(
  selection: Selection | null,
  articleElement: HTMLElement,
  openState: { composerOpen: boolean; selectionActionOpen: boolean },
) {
  if (openState.composerOpen || openState.selectionActionOpen) return true;
  if (!selection || selection.rangeCount === 0) return false;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    try {
      if (rangeTouchesArticleForDebug(selection.getRangeAt(index), articleElement)) return true;
    } catch {
      return true;
    }
  }

  return false;
}

export function describeReaderSelection(selection: Selection | null, articleElement: HTMLElement) {
  if (!selection) return { present: false };

  const details: Record<string, unknown> = {
    present: true,
    rangeCount: selection.rangeCount,
    isCollapsed: selection.isCollapsed,
    type: (selection as Selection & { type?: string }).type ?? null,
    anchorOffset: selection.anchorOffset,
    focusOffset: selection.focusOffset,
    anchorNode: describeSelectionNode(selection.anchorNode, articleElement),
    focusNode: describeSelectionNode(selection.focusNode, articleElement),
  };

  if (selection.rangeCount === 0) return details;

  try {
    const range = selection.getRangeAt(0);
    details.anchorIsRangeStart =
      selection.anchorNode === range.startContainer && selection.anchorOffset === range.startOffset;
    details.focusIsRangeEnd =
      selection.focusNode === range.endContainer && selection.focusOffset === range.endOffset;
    details.anchorSourceOffset = safeNumber(() =>
      selection.anchorNode
        ? offsetFromArticleStartIgnoringSelector(
            articleElement,
            selection.anchorNode,
            selection.anchorOffset,
            '[data-reader-translation]',
          )
        : -1,
    );
    details.focusSourceOffset = safeNumber(() =>
      selection.focusNode
        ? offsetFromArticleStartIgnoringSelector(
            articleElement,
            selection.focusNode,
            selection.focusOffset,
            '[data-reader-translation]',
          )
        : -1,
    );
    details.firstRange = describeRangeForDebug(range, articleElement);
  } catch (error) {
    details.firstRangeError = debugErrorMessage(error);
  }

  return details;
}

export function describeRangeForDebug(range: Range, articleElement: HTMLElement) {
  const rects = Array.from(range.getClientRects());

  return {
    collapsed: range.collapsed,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    selectedTextLength: safeNumber(() => range.toString().length),
    start: describeSelectionNode(range.startContainer, articleElement),
    end: describeSelectionNode(range.endContainer, articleElement),
    commonAncestor: describeSelectionNode(range.commonAncestorContainer, articleElement),
    insideArticle: safeBoolean(() => isRangeInsideArticle(range, articleElement)),
    touchesArticle: safeBoolean(() => rangeTouchesArticleForDebug(range, articleElement)),
    rawStart: safeNumber(() =>
      offsetFromArticleStart(articleElement, range.startContainer, range.startOffset),
    ),
    rawEnd: safeNumber(() =>
      offsetFromArticleStart(articleElement, range.endContainer, range.endOffset),
    ),
    sourceStart: safeNumber(() =>
      offsetFromArticleStartIgnoringSelector(
        articleElement,
        range.startContainer,
        range.startOffset,
        '[data-reader-translation]',
      ),
    ),
    sourceEnd: safeNumber(() =>
      offsetFromArticleStartIgnoringSelector(
        articleElement,
        range.endContainer,
        range.endOffset,
        '[data-reader-translation]',
      ),
    ),
    translationBlockId:
      translationElementForRange(range)?.getAttribute('data-reader-translation-block-id') ?? null,
    intersectsTranslation: safeBoolean(() =>
      rangeIntersectsSelectorForDebug(range, '[data-reader-translation]'),
    ),
    rectCount: rects.length,
    firstRect: rects[0] ? describeRectForDebug(rects[0]) : null,
    lastRect: rects.at(-1) ? describeRectForDebug(rects.at(-1) as DOMRect) : null,
  };
}

export function describePointerForDebug(
  event: PointerEvent,
  articleElement: HTMLElement,
  surfaceElement: HTMLElement | null,
) {
  const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
  const targetElement = event.target instanceof Element ? event.target : null;
  const targetSourceBlock = targetElement?.closest<HTMLElement>('[data-reader-source-block-id]');
  const pointSourceBlock = elementAtPoint?.closest<HTMLElement>('[data-reader-source-block-id]');

  return {
    clientX: Math.round(event.clientX),
    clientY: Math.round(event.clientY),
    pageX: Math.round(event.pageX),
    pageY: Math.round(event.pageY),
    targetRect: targetElement ? describeRectForDebug(targetElement.getBoundingClientRect()) : null,
    targetSourceBlockRect: targetSourceBlock
      ? describeRectForDebug(targetSourceBlock.getBoundingClientRect())
      : null,
    elementAtPoint: describeSelectionNode(elementAtPoint, articleElement),
    pointSourceBlockId: pointSourceBlock?.getAttribute('data-reader-source-block-id') ?? null,
    pointSourceBlockRect: pointSourceBlock
      ? describeRectForDebug(pointSourceBlock.getBoundingClientRect())
      : null,
    articleRect: describeRectForDebug(articleElement.getBoundingClientRect()),
    surfaceRect: surfaceElement
      ? describeRectForDebug(surfaceElement.getBoundingClientRect())
      : null,
  };
}

export function describeSelectionNode(node: Node | null, articleElement: HTMLElement | null) {
  if (!node) return { present: false };

  const element = node instanceof Element ? node : node.parentElement;
  const translationElement = element?.closest<HTMLElement>('[data-reader-translation]') ?? null;
  const sourceBlockElement = element?.closest<HTMLElement>('[data-reader-source-block-id]') ?? null;
  const actionElement = element?.closest<HTMLElement>('[data-reader-translation-action]') ?? null;
  const className =
    element && typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
      : '';

  return {
    present: true,
    nodeType: node.nodeType,
    nodeName: node.nodeName,
    elementTag: element?.tagName.toLowerCase() ?? null,
    elementId: element?.id || null,
    className: className || null,
    role: element?.getAttribute('role') ?? null,
    inArticle: articleElement ? articleElement.contains(node) : null,
    css: describeElementSelectionCss(element),
    sourceBlockId: sourceBlockElement?.getAttribute('data-reader-source-block-id') ?? null,
    translationBlockId:
      translationElement?.getAttribute('data-reader-translation-block-id') ?? null,
    translationStatus:
      translationElement?.getAttribute('data-reader-translation-status') ??
      actionElement?.getAttribute('data-reader-translation-status') ??
      null,
    translationAction: actionElement?.getAttribute('data-reader-translation-action') ?? null,
  };
}

export function describeArticleTranslationDom(articleElement: HTMLElement) {
  const bodyElement = articleElement.querySelector<HTMLElement>('.reader-article-body');
  const root = bodyElement || articleElement;
  const sourceBlocks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-reader-source-block-id]'),
  );
  const translationBlocks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-reader-translation]'),
  );
  const indicators = Array.from(
    root.querySelectorAll<HTMLElement>('.reader-bilingual-translation-indicator'),
  );

  return {
    rootChildCount: root.children.length,
    bodyChildCount: bodyElement?.children.length ?? null,
    sourceBlockCount: sourceBlocks.length,
    translationBlockCount: translationBlocks.length,
    indicatorCount: indicators.length,
    translationStatuses: countByAttribute(translationBlocks, 'data-reader-translation-status'),
    indicatorStatuses: countByAttribute(indicators, 'data-reader-translation-status'),
    sourceBlocks: sourceBlocks.slice(0, 24).map((element) => {
      const nextElement = nextElementSiblingSkippingEmptyText(element);
      const indicator = element.querySelector<HTMLElement>(
        '.reader-bilingual-translation-indicator',
      );
      return {
        blockId: element.getAttribute('data-reader-source-block-id'),
        tag: element.tagName.toLowerCase(),
        childIndex: elementChildIndex(element),
        textLength: element.textContent?.length ?? 0,
        rect: describeElementRect(element),
        css: describeElementSelectionCss(element),
        indicatorStatus: indicator?.getAttribute('data-reader-translation-status') ?? null,
        nextElement: describeElementForDomDebug(nextElement),
      };
    }),
    translationBlocks: translationBlocks.slice(0, 24).map((element) => ({
      blockId: element.getAttribute('data-reader-translation-block-id'),
      status: element.getAttribute('data-reader-translation-status'),
      tag: element.tagName.toLowerCase(),
      childIndex: elementChildIndex(element),
      textLength: element.textContent?.length ?? 0,
      rect: describeElementRect(element),
      css: describeElementSelectionCss(element),
      previousElement: describeElementForDomDebug(previousElementSiblingSkippingEmptyText(element)),
      nextElement: describeElementForDomDebug(nextElementSiblingSkippingEmptyText(element)),
    })),
  };
}

export function describeHighlightBoxesForDebug(boxes: HighlightBox[]) {
  return {
    count: boxes.length,
    first: boxes[0] ? describeHighlightBoxForDebug(boxes[0]) : null,
    last: boxes.at(-1) ? describeHighlightBoxForDebug(boxes.at(-1) as HighlightBox) : null,
    boxes: boxes.slice(0, 6).map(describeHighlightBoxForDebug),
  };
}

export function describeAnchorForDebug(anchor: Annotation['anchor']) {
  return {
    start: anchor.start,
    end: anchor.end,
    exactLength: anchor.exact.length,
    trimmedLength: anchor.exact.trim().length,
    segmentId: anchor.segmentId ?? null,
  };
}

function describeElementForDomDebug(element: Element | null) {
  if (!element) return null;
  const htmlElement = element instanceof HTMLElement ? element : null;
  return {
    tag: element.tagName.toLowerCase(),
    className:
      typeof element.className === 'string'
        ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ') || null
        : null,
    sourceBlockId: htmlElement?.getAttribute('data-reader-source-block-id') ?? null,
    translationBlockId: htmlElement?.getAttribute('data-reader-translation-block-id') ?? null,
    translationStatus: htmlElement?.getAttribute('data-reader-translation-status') ?? null,
    childIndex: elementChildIndex(element),
    textLength: element.textContent?.length ?? 0,
  };
}

function describeElementSelectionCss(element: Element | null) {
  if (!element || typeof window === 'undefined') return null;
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    pointerEvents: style.pointerEvents,
    userSelect: style.userSelect,
    webkitUserSelect: style.getPropertyValue('-webkit-user-select') || null,
    visibility: style.visibility,
  };
}

function describeElementRect(element: Element) {
  return describeRectForDebug(element.getBoundingClientRect());
}

function describeRectForDebug(rect: DOMRect | DOMRectReadOnly) {
  return {
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function describeHighlightBoxForDebug(box: HighlightBox) {
  return {
    id: box.id,
    top: Math.round(box.top),
    left: Math.round(box.left),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

function countByAttribute(elements: HTMLElement[], attribute: string) {
  const counts: Record<string, number> = {};
  for (const element of elements) {
    const value = element.getAttribute(attribute) || 'none';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function elementChildIndex(element: Element) {
  if (!element.parentElement) return null;
  return Array.prototype.indexOf.call(element.parentElement.children, element);
}

function nextElementSiblingSkippingEmptyText(element: Element) {
  return element.nextElementSibling;
}

function previousElementSiblingSkippingEmptyText(element: Element) {
  return element.previousElementSibling;
}

function rangeTouchesArticleForDebug(range: Range, articleElement: HTMLElement) {
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  if (articleElement.contains(startNode) || articleElement.contains(endNode)) return true;
  if (articleElement.contains(range.commonAncestorContainer)) return true;
  return range.intersectsNode(articleElement);
}

function rangeIntersectsSelectorForDebug(range: Range, selector: string) {
  const nodes = [range.startContainer, range.endContainer];
  if (
    nodes.some((node) => {
      const element = node instanceof Element ? node : node.parentElement;
      return Boolean(element?.closest(selector));
    })
  ) {
    return true;
  }

  const container = document.createElement('div');
  container.append(range.cloneContents());
  return Boolean(container.querySelector(selector));
}

function safeBoolean(read: () => boolean) {
  try {
    return read();
  } catch (error) {
    return debugErrorMessage(error);
  }
}

function safeNumber(read: () => number) {
  try {
    return read();
  } catch (error) {
    return debugErrorMessage(error);
  }
}

function debugErrorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function selectionDebugEventName(event: string) {
  return event.replace(/[^a-z0-9_.:-]+/gi, '_');
}
