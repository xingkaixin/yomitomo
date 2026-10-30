import { createElement, useCallback, useReducer, useRef, type RefObject } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationColor,
  articleTitleTocItems,
  extractTocItems,
  prepareTextOffsetRangeResolver,
  rangeForTranslationTextAnchor,
  rangeHighlightBoxes,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import {
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
} from '../../shell/app-renderer-performance';

export const sourceTocOptions: ExtractTocOptions = {
  headingSelector:
    '.reader-article-body h1, .reader-article-body h2, .reader-article-body h3, .reader-article-body h4',
  inferredSelector:
    '.reader-article-body p, .reader-article-body div:not([data-reader-translation]), .reader-article-body section',
};

type UseWebReaderBoxesInput = {
  annotationAgents: PublicAgent[];
  annotations: Annotation[];
  article: ArticleRecord;
  articleRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  contentHtml: string;
  onMeasured?: (result: WebReaderBoxesResult, outlineChanged: boolean) => void;
  userProfile: UserProfile;
};

export type WebReaderBoxesResult = {
  boxes: HighlightBox[];
  text: string;
  tocItems: TocItem[];
};

type WebReaderBoxesEvent = { type: 'measured' } & WebReaderBoxesResult;

const emptyWebReaderBoxes: WebReaderBoxesResult = { boxes: [], text: '', tocItems: [] };
const emptyResultSignature = { boxes: '', text: '', tocItems: '' };

function webReaderBoxesReducer(
  _state: WebReaderBoxesResult,
  { boxes, text, tocItems }: WebReaderBoxesEvent,
) {
  return { boxes, text, tocItems };
}

export function useWebReaderBoxes({
  annotationAgents,
  annotations,
  article,
  articleRef,
  canvasRef,
  contentHtml,
  onMeasured,
  userProfile,
}: UseWebReaderBoxesInput) {
  const [result, dispatch] = useReducer(webReaderBoxesReducer, emptyWebReaderBoxes);
  const lastResultRef = useRef(emptyResultSignature);
  const measureRef = useRef<((force?: boolean) => void) | null>(null);
  const readInput = useStableCallback(() => ({
    annotationAgents,
    annotations,
    article,
    contentHtml,
    onMeasured,
    userProfile,
  }));
  const annotationLayoutKey = `annotations\n${article.title}\n${webReaderAnnotationBoxesSignature(
    annotations,
    userProfile,
    annotationAgents,
  )}`;

  const publish = useCallback((next: WebReaderBoxesResult, outlineChanged: boolean) => {
    dispatch({ type: 'measured', ...next });
    readInput().onMeasured?.(next, outlineChanged);
  }, []);

  // Rendered html replaces the article body, so measurement restarts with new observers.
  const attachContent = useCallback(
    (marker: HTMLElement | null) => {
      if (!marker) return;
      const articleElement = articleRef.current;
      const canvasElement = canvasRef.current;
      if (!articleElement || !canvasElement) {
        lastResultRef.current = emptyResultSignature;
        publish(emptyWebReaderBoxes, true);
        return;
      }

      let frame = 0;
      let lastLayoutSignature = '';
      const updateBoxes = (force = false) => {
        const layoutSignature = webReaderBoxesLayoutSignature(articleElement, canvasElement);
        if (!force && layoutSignature === lastLayoutSignature) return;
        lastLayoutSignature = layoutSignature;
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          const currentInput = readInput();
          const startedAt = performance.now();
          const sourceRangeResolver = prepareTextOffsetRangeResolver(
            articleElement,
            '[data-reader-translation]',
          );
          const text = sourceRangeResolver.text;
          const canvasRect = canvasElement.getBoundingClientRect();
          const extractedTocItems = extractTocItems(articleElement, sourceTocOptions);
          const nextTocItems =
            extractedTocItems.length > 0
              ? extractedTocItems
              : articleTitleTocItems(articleElement, currentInput.article.title);
          let resolvedAnchorCount = 0;
          let rangeCount = 0;
          const nextBoxes = currentInput.annotations.flatMap((annotation) => {
            const range = annotation.anchor.segmentId
              ? rangeForTranslationTextAnchor(articleElement, annotation.anchor)
              : (() => {
                  const position = resolveTextAnchor(text, annotation.anchor);
                  if (!position) return null;
                  return sourceRangeResolver.range(position.start, position.end);
                })();
            if (!range) return [];
            resolvedAnchorCount += 1;
            rangeCount += 1;
            return rangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
              Object.assign(box, {
                annotationId: annotation.id,
                contributorId: webReaderAnnotationContributorId(annotation),
                color: annotationColor(
                  annotation,
                  currentInput.userProfile,
                  currentInput.annotationAgents,
                ),
              }),
            );
          });
          const resultSignature = {
            boxes: webReaderBoxesSignature(nextBoxes),
            text,
            tocItems: webReaderTocItemsSignature(nextTocItems),
          };
          const lastResult = lastResultRef.current;
          const outlineChanged =
            lastResult.text !== text || lastResult.tocItems !== resultSignature.tocItems;
          if (!outlineChanged && lastResult.boxes === resultSignature.boxes) return;
          lastResultRef.current = resultSignature;
          publish({ boxes: nextBoxes, text, tocItems: nextTocItems }, outlineChanged);
          recordRendererPerformanceTiming('reader_highlight_boxes', {
            source: 'web',
            elapsedMs: rendererPerformanceElapsedMs(startedAt),
            articleId: currentInput.article.id,
            annotationCount: currentInput.annotations.length,
            resolvedAnchorCount,
            rangeCount,
            boxCount: nextBoxes.length,
            textChars: text.length,
            tocItemCount: nextTocItems.length,
            contentHtmlChars: currentInput.contentHtml.length,
          });
        });
      };

      measureRef.current = updateBoxes;
      updateBoxes(true);
      const resizeObserver = new ResizeObserver(() => updateBoxes());
      resizeObserver.observe(articleElement);
      resizeObserver.observe(canvasElement);
      const updateBoxesForWindowResize = () => updateBoxes();
      window.addEventListener('resize', updateBoxesForWindowResize);

      return () => {
        if (measureRef.current === updateBoxes) measureRef.current = null;
        window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateBoxesForWindowResize);
      };
    },
    [articleRef, canvasRef, publish],
  );

  const remeasure = useCallback((marker: HTMLElement | null) => {
    if (marker) measureRef.current?.(true);
  }, []);

  return {
    boxes: result.boxes,
    // Rendered after the reader surface so the article and canvas exist when the markers mount.
    markers: [
      createElement('span', { hidden: true, key: contentHtml, ref: attachContent }),
      createElement('span', { hidden: true, key: annotationLayoutKey, ref: remeasure }),
    ],
    text: result.text,
    tocItems: result.tocItems,
  };
}

function webReaderBoxesLayoutSignature(articleElement: HTMLElement, canvasElement: HTMLElement) {
  return [elementLayoutSignature(articleElement), canvasCoordinateSignature(canvasElement)].join(
    '|',
  );
}

function elementLayoutSignature(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function canvasCoordinateSignature(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return `${Math.round(rect.left)}:${Math.round(rect.width)}`;
}

function webReaderBoxesSignature(boxes: HighlightBox[]) {
  return boxes
    .map(
      (box) =>
        `${box.id}:${box.annotationId}:${box.contributorId || ''}:${box.color}:${roundedBoxValue(box.top)}:${roundedBoxValue(box.left)}:${roundedBoxValue(box.width)}:${roundedBoxValue(box.height)}`,
    )
    .join('|');
}

function webReaderTocItemsSignature(tocItems: TocItem[]) {
  return tocItems
    .map((item) => `${item.index}:${item.depth}:${item.start}:${item.end}:${item.text}`)
    .join('|');
}

function roundedBoxValue(value: number) {
  return Math.round(value * 100) / 100;
}

function webReaderAnnotationBoxesSignature(
  annotations: Annotation[],
  userProfile: UserProfile,
  annotationAgents: PublicAgent[],
) {
  return JSON.stringify(
    annotations.map((annotation) => [
      annotation.id,
      webReaderAnchorSignature(annotation.anchor),
      webReaderAnnotationContributorId(annotation),
      annotationColor(annotation, userProfile, annotationAgents),
    ]),
  );
}

function webReaderAnchorSignature(anchor: Annotation['anchor']) {
  return [
    anchor.exact,
    anchor.prefix,
    anchor.suffix,
    anchor.start,
    anchor.end,
    anchor.paragraphId ?? '',
    anchor.chapterId ?? '',
    anchor.segmentId ?? '',
    anchor.textStartInParagraph ?? null,
    anchor.textEndInParagraph ?? null,
    anchor.textStartInBook ?? null,
    anchor.textEndInBook ?? null,
    anchor.quoteHash ?? '',
  ];
}

function webReaderAnnotationContributorId(annotation: Annotation) {
  return annotation.author.kind === 'agent'
    ? annotation.author.agentId
    : annotation.author.userId || annotation.author.username;
}
