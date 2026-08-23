import { useCallback, useEffect, useRef } from 'react';
import type { Annotation } from '@yomitomo/shared';
import { createEpubTextAnchor, type HighlightBox } from '@yomitomo/core';
import { foliateRangeHighlightBoxes, type EbookBoxUpdateReason } from './ebook-annotation-layout';
import { ebookHasStableSectionChapterMapping, ebookSectionIndexForChapter } from './ebook-content';
import {
  currentFoliateContent,
  waitForAnimationFrame,
  waitForFoliateIdle,
  type FoliatePageInfo,
  type FoliateViewElement,
} from './ebook-foliate-view';
import { normalizeRenderedText, rangeForEbookAnchorInDocument } from './ebook-text-anchor';
import { ebookAnnotationNavigationState } from './app-source-bookcase-ebook-utils';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { EbookBookcaseProps } from '../bookcase/app-source-bookcase';

type NavigationRef<T> = { current: T };

export function useEbookAnnotationNavigation({
  annotations,
  annotationsRef,
  article,
  boxes,
  canvasRef,
  ebookText,
  focusAnnotationId,
  onFocusedAnnotation,
  openAnnotation,
  pageInfo,
  scheduleEbookBoxUpdate,
  viewRef,
}: {
  annotations: Annotation[];
  annotationsRef: NavigationRef<Annotation[]>;
  article: EbookBookcaseProps['content']['article'];
  boxes: HighlightBox[];
  canvasRef: NavigationRef<HTMLElement | null>;
  ebookText: string;
  focusAnnotationId: EbookBookcaseProps['readerControl']['focusAnnotationId'];
  onFocusedAnnotation: EbookBookcaseProps['annotationActions']['onFocusedAnnotation'];
  openAnnotation: (annotationId: string) => void;
  pageInfo: FoliatePageInfo | null;
  scheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  viewRef: NavigationRef<FoliateViewElement | null>;
}) {
  const onFocusedAnnotationRef = useRef(onFocusedAnnotation);

  useEffect(() => {
    onFocusedAnnotationRef.current = onFocusedAnnotation;
  }, [onFocusedAnnotation]);

  const locateEbookAnchor = useCallback(
    async (annotationId: string, anchor: Annotation['anchor']) => {
      const view = viewRef.current;
      const index = article.ebook.index;
      if (!view || !index) {
        debugEbookAnnotationNavigation('skip', {
          articleId: article.id,
          annotationId,
          format: article.ebook.metadata.format,
          hasView: Boolean(view),
          hasIndex: Boolean(index),
        });
        return null;
      }

      const chapter = anchor.chapterId
        ? index.chapters.find((item) => item.id === anchor.chapterId)
        : null;
      const sectionIndex = chapter ? ebookSectionIndexForChapter(article, view, chapter) : -1;
      const sectionCount = view.book?.sections?.length ?? 0;
      const stableSectionMapping = ebookHasStableSectionChapterMapping(article);
      debugEbookAnnotationNavigation('start', {
        articleId: article.id,
        annotationId,
        format: article.ebook.metadata.format,
        chapterId: anchor.chapterId,
        chapterHref: chapter?.href,
        chapterIndex: chapter?.indexInBook,
        sectionIndex,
        sectionCount,
        stableSectionMapping,
        textStartInBook: anchor.textStartInBook,
        textEndInBook: anchor.textEndInBook,
        exact: normalizeRenderedText(anchor.exact).slice(0, 80),
      });

      let resolved: EbookAnchorLocation | null = null;
      const textFractionTarget =
        typeof anchor.textStartInBook === 'number' && index.textLength > 0
          ? Math.max(0, Math.min(1, anchor.textStartInBook / index.textLength))
          : null;

      if (!stableSectionMapping) {
        resolved = await resolveCurrentEbookAnchor(view, anchor, 'current-section');
        if (!resolved?.range) {
          debugEbookAnnotationNavigation('anchor_lookup_miss', {
            articleId: article.id,
            annotationId,
            format: article.ebook.metadata.format,
            hasTextFractionTarget: textFractionTarget !== null,
            resolvedSectionIndex: resolved?.sectionIndex,
            resolvedMethod: resolved?.method,
            reason: 'unstable_section_mapping',
            sectionCount,
          });
        }
      } else if (sectionIndex >= 0) {
        await view.goTo(sectionIndex);
        resolved = await resolveCurrentEbookAnchor(view, anchor, 'chapter-section');
      } else {
        resolved = await resolveCurrentEbookAnchor(view, anchor, 'current-section');
      }

      if (
        !resolved?.range &&
        stableSectionMapping &&
        sectionIndex < 0 &&
        textFractionTarget !== null
      ) {
        await view.goToFraction(textFractionTarget);
        resolved = await resolveCurrentEbookAnchor(view, anchor, 'text-fraction');
      }

      debugEbookAnnotationNavigation('resolved', {
        articleId: article.id,
        annotationId,
        format: article.ebook.metadata.format,
        hasDocument: Boolean(resolved?.doc),
        method: resolved?.method,
        rangeFound: Boolean(resolved?.range),
        resolvedSectionIndex: resolved?.sectionIndex,
        documentTextIncludesExact: resolved?.doc
          ? normalizeRenderedText(resolved.doc.body?.textContent || '').includes(
              normalizeRenderedText(anchor.exact),
            )
          : false,
      });
      return resolved;
    },
    [article, viewRef],
  );

  const goToEbookAnchor = useCallback(
    async (annotationId: string, anchor: Annotation['anchor']) => {
      const resolved = await locateEbookAnchor(annotationId, anchor);
      if (!resolved) return false;
      if (resolved.range) await viewRef.current?.renderer?.scrollToAnchor?.(resolved.range);
      await waitForAnimationFrame();
      debugEbookAnnotationNavigation('go_to_complete', {
        annotationId,
        articleId: article.id,
        format: article.ebook.metadata.format,
        method: resolved.method,
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        rangeFound: Boolean(resolved.range),
        resolvedSectionIndex: resolved.sectionIndex,
      });
      scheduleEbookBoxUpdate('annotation_navigation');
      return Boolean(resolved.range);
    },
    [article.id, article.ebook.metadata.format, locateEbookAnchor, scheduleEbookBoxUpdate, viewRef],
  );

  const goToAnnotation = useCallback(
    async (annotationId: string) => {
      const annotation = annotationsRef.current.find((item) => item.id === annotationId);
      if (!annotation) return false;
      return goToEbookAnchor(annotationId, annotation.anchor);
    },
    [annotationsRef, goToEbookAnchor],
  );

  const revealSearchMatch = useCallback(
    async (match: { id: string; start: number; end: number }) => {
      const view = viewRef.current;
      const index = article.ebook.index;
      const canvasElement = canvasRef.current;
      if (!view || !index || !canvasElement) return [];

      const anchor = createEpubTextAnchor(index, ebookText, match.start, match.end);
      const resolved = await locateEbookAnchor(match.id, anchor);
      if (!resolved?.range) return [];
      await view.renderer?.scrollToAnchor?.(resolved.range);
      await waitForAnimationFrame();
      return foliateRangeHighlightBoxes(
        resolved.range,
        canvasElement.getBoundingClientRect(),
        match.id,
      );
    },
    [article.ebook.index, canvasRef, ebookText, locateEbookAnchor, viewRef],
  );

  const resolveAnnotationNavigation = useCallback(
    ({
      activeId,
      annotations: navigationAnnotations,
    }: {
      activeId: string | null;
      annotations: Annotation[];
    }) =>
      ebookAnnotationNavigationState({
        activeId,
        annotations: navigationAnnotations,
        boxes,
        pageInfo,
        article,
        view: viewRef.current,
      }),
    [article, boxes, pageInfo, viewRef],
  );

  const navigateAnnotation = useCallback(
    (annotationId: string) => {
      openAnnotation(annotationId);
      void goToAnnotation(annotationId);
    },
    [goToAnnotation, openAnnotation],
  );

  const focusPageAnnotation = useCallback(
    (annotationId: string) => {
      openAnnotation(annotationId);
      if (boxes.some((box) => box.annotationId === annotationId)) return;
      void goToAnnotation(annotationId);
    },
    [boxes, goToAnnotation, openAnnotation],
  );

  useEffect(() => {
    if (!focusAnnotationId) return;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'ebook',
      phase: 'effect_start',
      articleId: article.id,
      annotationId: focusAnnotationId,
      annotationCount: annotations.length,
      boxCount: boxes.length,
      pageInfo: viewRef.current?.getPageInfo?.() ?? null,
      hasView: Boolean(viewRef.current),
    });
    const currentAnnotations = annotationsRef.current;
    if (!currentAnnotations.some((annotation) => annotation.id === focusAnnotationId)) {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'ebook',
        phase: 'annotation_missing_consume',
        articleId: article.id,
        annotationId: focusAnnotationId,
        annotationCount: currentAnnotations.length,
      });
      onFocusedAnnotationRef.current();
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    void goToAnnotation(focusAnnotationId).then((navigated) => {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'ebook',
        phase: cancelled ? 'navigation_cancelled' : 'navigation_complete',
        articleId: article.id,
        annotationId: focusAnnotationId,
        navigated,
        boxCount: boxes.length,
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
      });
      if (cancelled) return;
      timer = window.setTimeout(() => {
        recordRendererPerformanceTiming('reader_focus', {
          source: 'ebook',
          phase: 'complete_timer',
          articleId: article.id,
          annotationId: focusAnnotationId,
          pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        });
        onFocusedAnnotationRef.current();
      }, 180);
    });
    return () => {
      cancelled = true;
      recordRendererPerformanceTiming('reader_focus', {
        source: 'ebook',
        phase: 'effect_cleanup',
        articleId: article.id,
        annotationId: focusAnnotationId,
        hadTimer: timer !== null,
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
      });
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [article.id, focusAnnotationId]);

  return {
    focusPageAnnotation,
    goToAnnotation,
    goToEbookAnchor,
    navigateAnnotation,
    resolveAnnotationNavigation,
    revealSearchMatch,
  };
}

type EbookAnchorLocation = {
  doc: Document | null;
  method: 'chapter-section' | 'current-section' | 'text-fraction';
  range: Range | null;
  sectionIndex: number | null;
};

async function resolveCurrentEbookAnchor(
  view: FoliateViewElement,
  anchor: Annotation['anchor'],
  method: EbookAnchorLocation['method'],
): Promise<EbookAnchorLocation> {
  await waitForFoliateIdle();
  await waitForAnimationFrame();

  const content = currentFoliateContent(view);
  const doc = content?.doc ?? null;
  const range = doc ? rangeForEbookAnchorInDocument(doc, anchor) : null;
  return {
    doc,
    method,
    range,
    sectionIndex: currentEbookSectionIndex(view, content?.index),
  };
}

function currentEbookSectionIndex(view: FoliateViewElement, fallback?: number) {
  const index =
    currentFoliateContent(view)?.index ?? view.getPageInfo?.()?.sectionIndex ?? fallback;
  return typeof index === 'number' && Number.isInteger(index) ? index : null;
}

function debugEbookAnnotationNavigation(event: string, details: Record<string, unknown>) {
  try {
    if (window.localStorage.getItem('yomitomo:ebook-navigation-debug') !== '1') return;
  } catch {
    return;
  }
  console.info(`[yomitomo:ebook-navigation] ${event}`, details);
}
