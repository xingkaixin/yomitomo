import { useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import i18next from 'i18next';
import {
  isPdfTextAnchor,
  type Annotation,
  type ArticleRecord,
  type PublicAgent,
} from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { animateTheaterHighlight, sleep } from '@yomitomo/reader-ui/reader-animation';
import { appendAgentAnnotationToArticle as appendPersistedAgentAnnotation } from '../bookcase/append-agent-annotation-to-article';
import type { SourceBookcaseProps } from '../bookcase/source-bookcase-types';
import {
  pdfiumAnnotationAgentName,
  pdfiumAnnotationIsVisible,
  pdfiumAnnotationTheaterBoxes,
} from './pdfium-annotation-layout';
import type { PageMetric } from './pdfium-geometry';
import type { usePdfiumVirtualReading } from './app-source-bookcase-pdfium-virtual-reading';

type PdfiumVirtualReading = Pick<
  ReturnType<typeof usePdfiumVirtualReading>,
  | 'finishPdfiumVirtualCursor'
  | 'finishPdfiumVirtualReading'
  | 'pdfiumOffscreenDirection'
  | 'pdfiumReadingFallbackCursor'
  | 'stopPdfiumVirtualReading'
  | 'updatePdfiumVirtualCursor'
>;

export function usePdfiumAgentAnnotationPlayback({
  annotationAgents,
  annotationsRef,
  applyAnnotations,
  article,
  canvasRef,
  isCurrentArticle,
  mergeArticleAgentAnnotation,
  onOpenAnnotation,
  pageMetricsRef,
  setAgentTheaterBoxes,
  updatePageMetrics,
  virtualReading,
}: {
  annotationAgents: PublicAgent[];
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => void;
  article: ArticleRecord;
  canvasRef: RefObject<HTMLDivElement | null>;
  isCurrentArticle: (articleId: string) => boolean;
  mergeArticleAgentAnnotation: SourceBookcaseProps['articleActions']['mergeArticleAgentAnnotation'];
  onOpenAnnotation: SourceBookcaseProps['annotationActions']['onOpenAnnotation'];
  pageMetricsRef: RefObject<Record<number, PageMetric>>;
  setAgentTheaterBoxes: Dispatch<SetStateAction<HighlightBox[]>>;
  updatePageMetrics: () => void;
  virtualReading: PdfiumVirtualReading;
}) {
  const queueRef = useRef(Promise.resolve());

  function enqueue(articleId: string, annotation: Annotation) {
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(() => play(articleId, annotation));
    return queueRef.current;
  }

  async function play(articleId: string, annotation: Annotation) {
    if (article.id !== articleId || !isPdfTextAnchor(annotation.anchor)) {
      await append(articleId, annotation);
      return;
    }

    const author = annotation.author;
    const cursorAgent =
      author.kind === 'agent'
        ? annotationAgents.find(
            (agent) => agent.id === author.agentId || agent.username === author.username,
          )
        : undefined;
    const cursorId = cursorAgent?.id || (author.kind === 'agent' ? author.agentId : annotation.id);
    updatePageMetrics();
    const theaterBoxes = pdfiumAnnotationTheaterBoxes(annotation, pageMetricsRef.current);
    const firstBox = theaterBoxes[0];
    const lastBox = theaterBoxes[theaterBoxes.length - 1];
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!firstBox || !lastBox || !canvasRect) {
      const direction = virtualReading.pdfiumOffscreenDirection(
        annotation.anchor.pageIndex,
        pageMetricsRef.current,
      );
      if (direction) {
        const cursor = virtualReading.pdfiumReadingFallbackCursor(
          cursorId,
          cursorAgent,
          annotation.anchor.pageIndex,
          i18next.t('source.agentStatus.addingThought', {
            name: pdfiumAnnotationAgentName(annotation),
          }),
          0,
        );
        if (cursor) {
          virtualReading.updatePdfiumVirtualCursor(cursorId, {
            ...cursor,
            label: i18next.t('source.agentStatus.addingThoughtOffscreen', {
              direction: i18next.t(`source.agentStatus.direction.${direction}`),
              name: pdfiumAnnotationAgentName(annotation),
            }),
            offscreen: direction,
          });
          await sleep(700);
        }
      }
      await append(articleId, annotation);
      virtualReading.finishPdfiumVirtualReading(cursorId);
      return;
    }

    const label = i18next.t('source.agentStatus.addingThought', {
      name: pdfiumAnnotationAgentName(annotation),
    });
    virtualReading.stopPdfiumVirtualReading(cursorId);
    virtualReading.updatePdfiumVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: canvasRect.left + firstBox.left,
      y: canvasRect.top + firstBox.top + firstBox.height / 2,
      label,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(260);

    await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
      const cursorBox = nextBoxes[nextBoxes.length - 1];
      if (cursorBox) {
        virtualReading.updatePdfiumVirtualCursor(cursorId, {
          id: cursorId,
          visible: true,
          x: canvasRect.left + cursorBox.left + cursorBox.width,
          y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
          label,
          offscreen: null,
          agent: cursorAgent,
        });
      }
      setAgentTheaterBoxes(nextBoxes);
    });

    await append(articleId, annotation);
    setAgentTheaterBoxes([]);
    virtualReading.updatePdfiumVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: canvasRect.left + lastBox.left + lastBox.width,
      y: canvasRect.top + lastBox.top + lastBox.height / 2,
      label: i18next.t('source.agentStatus.withSuffix', {
        name: pdfiumAnnotationAgentName(annotation),
        suffix: i18next.t('source.agentStatus.thoughtAdded'),
      }),
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
    virtualReading.finishPdfiumVirtualCursor(cursorId);
  }

  async function append(articleId: string, annotation: Annotation) {
    return appendPersistedAgentAnnotation({
      annotations: () => annotationsRef.current,
      applyAnnotations,
      annotation,
      articleId,
      isAnnotationVisible: (annotationId, currentAnnotations) =>
        pdfiumAnnotationIsVisible(annotationId, currentAnnotations, pageMetricsRef.current),
      isCurrentArticle,
      mergeArticleAgentAnnotation,
      onOpenAnnotation,
    });
  }

  return { enqueue };
}
