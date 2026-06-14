import { useEffect, useState, type RefObject } from 'react';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationColor,
  articleTitleTocItems,
  extractTocItems,
  rangeFromOffsetsIgnoringSelector,
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

  useEffect(() => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) {
      setBoxes([]);
      setTocItems([]);
      return;
    }

    let frame = 0;
    const updateBoxes = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
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
          const position = resolveTextAnchor(text, annotation.anchor);
          if (!position) return [];
          resolvedAnchorCount += 1;
          const range = rangeFromOffsetsIgnoringSelector(
            articleElement,
            position.start,
            position.end,
            '[data-reader-translation]',
          );
          if (!range) return [];
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

    updateBoxes();
    const resizeObserver = new ResizeObserver(updateBoxes);
    resizeObserver.observe(articleElement);
    resizeObserver.observe(canvasElement);
    window.addEventListener('resize', updateBoxes);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBoxes);
    };
  }, [annotationAgents, annotations, article, articleRef, canvasRef, contentHtml, userProfile]);

  return { boxes, tocItems };
}
