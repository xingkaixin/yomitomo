import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationColor,
  articleTitleTocItems,
  extractTocItems,
  rangeFromOffsetsIgnoringSelector,
  rangeForTranslationTextAnchor,
  rangeHighlightBoxes,
  sourceTextContent,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import {
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
} from '../bookcase/app-source-bookcase-shared';

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
  userProfile: UserProfile;
};

export function useWebReaderBoxes({
  annotationAgents,
  annotations,
  article,
  articleRef,
  canvasRef,
  contentHtml,
  userProfile,
}: UseWebReaderBoxesInput) {
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const lastResultSignatureRef = useRef('');

  useEffect(() => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) {
      lastResultSignatureRef.current = '';
      setBoxes([]);
      setTocItems([]);
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
        const startedAt = performance.now();
        const text = sourceTextContent(articleElement);
        const canvasRect = canvasElement.getBoundingClientRect();
        const extractedTocItems = extractTocItems(articleElement, sourceTocOptions);
        const nextTocItems =
          extractedTocItems.length > 0
            ? extractedTocItems
            : articleTitleTocItems(articleElement, article.title);
        let resolvedAnchorCount = 0;
        let rangeCount = 0;
        const nextBoxes = annotations.flatMap((annotation) => {
          const range = annotation.anchor.segmentId
            ? rangeForTranslationTextAnchor(articleElement, annotation.anchor)
            : (() => {
                const position = resolveTextAnchor(text, annotation.anchor);
                if (!position) return null;
                return rangeFromOffsetsIgnoringSelector(
                  articleElement,
                  position.start,
                  position.end,
                  '[data-reader-translation]',
                );
              })();
          if (!range) return [];
          resolvedAnchorCount += 1;
          rangeCount += 1;
          return rangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
            Object.assign(box, {
              annotationId: annotation.id,
              contributorId:
                annotation.agentId ||
                annotation.agentUsername ||
                annotation.userId ||
                annotation.userUsername ||
                annotation.author,
              color: annotationColor(annotation, userProfile, annotationAgents),
            }),
          );
        });
        const resultSignature = webReaderBoxesResultSignature(nextBoxes, nextTocItems);
        if (lastResultSignatureRef.current === resultSignature) return;
        lastResultSignatureRef.current = resultSignature;
        setTocItems(nextTocItems);
        setBoxes(nextBoxes);
        recordRendererPerformanceTiming('reader_highlight_boxes', {
          source: 'web',
          elapsedMs: rendererPerformanceElapsedMs(startedAt),
          articleId: article.id,
          annotationCount: annotations.length,
          resolvedAnchorCount,
          rangeCount,
          boxCount: nextBoxes.length,
          textChars: text.length,
          tocItemCount: nextTocItems.length,
          contentHtmlChars: contentHtml.length,
        });
      });
    };

    updateBoxes(true);
    const resizeObserver = new ResizeObserver(() => updateBoxes());
    resizeObserver.observe(articleElement);
    resizeObserver.observe(canvasElement);
    const updateBoxesForWindowResize = () => updateBoxes();
    window.addEventListener('resize', updateBoxesForWindowResize);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBoxesForWindowResize);
    };
  }, [annotationAgents, annotations, article, articleRef, canvasRef, contentHtml, userProfile]);

  return { boxes, tocItems };
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

function webReaderBoxesResultSignature(boxes: HighlightBox[], tocItems: TocItem[]) {
  return [
    boxes
      .map(
        (box) =>
          `${box.id}:${box.annotationId}:${box.contributorId || ''}:${box.color}:${roundedBoxValue(box.top)}:${roundedBoxValue(box.left)}:${roundedBoxValue(box.width)}:${roundedBoxValue(box.height)}`,
      )
      .join('|'),
    tocItems
      .map((item) => `${item.index}:${item.depth}:${item.start}:${item.end}:${item.text}`)
      .join('|'),
  ].join('||');
}

function roundedBoxValue(value: number) {
  return Math.round(value * 100) / 100;
}
