import React from 'react';
import { annotationIdsAtHighlightPoint, type HighlightBox } from '@yomitomo/core';
import type { Annotation, SelectionActionShortcuts } from '@yomitomo/shared';
import type { AnnotationRailLayout } from '../annotations/reader-annotations';
import { useReaderAnnotationRail } from '../annotations/use-reader-annotation-rail';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationRequest,
  AnnotationNavigationState,
  HighlightChoice,
  PendingComposer,
  SelectionAction,
} from './reader-app-view-types';
import { useReaderShellInteractions } from './use-reader-shell-interactions';

export const stackedAnnotationRailLayout: AnnotationRailLayout = {
  articleCenterX: 0,
  articleWidth: 0,
  leftRailLeft: 0,
  mode: 'stacked',
  railWidth: 0,
  rightRailLeft: 0,
};

const READER_ANNOTATION_RAIL_GAP = 20;
const READER_MIN_ANNOTATION_RAIL_WIDTH = 220;
const READER_ANNOTATION_RAIL_WIDTH = 360;
const READER_MIN_ASIDE_ARTICLE_WIDTH = 600;
const READER_HIGHLIGHT_POINTER_PRESERVE_PADDING = 8;

const emptyAnnotationNavigation: AnnotationNavigationState = {
  currentIndex: 0,
  nextId: null,
  previousId: null,
  totalCount: 0,
};

export type UseReaderShellStateOptions = {
  activeId: string | null;
  annotationRailLayoutOverride?: AnnotationRailLayout;
  annotations: Annotation[];
  articleId: string;
  articleRef: React.RefObject<HTMLElement | null>;
  autoExpandNewAnnotations?: boolean;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  filteredAnnotations: Annotation[];
  highlightChoice: HighlightChoice | null;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  readerContentWidth?: number;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  settingsOpen: boolean;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  onAnnotationLayoutChange?: () => void;
  onCancelComposer: () => void;
  onClearActiveAnnotation: () => void;
  onClearSelection: () => void;
  onCloseFloatingPanels: () => void;
  onCloseHighlightChoice: () => void;
  onCloseReaderChat?: () => void;
  onAskSelection?: (action: SelectionAction) => void;
  onNavigateAnnotation?: (annotationId: string, direction: AnnotationNavigationDirection) => void;
  onOpenReaderChat?: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onResolveAnnotationNavigation?: (
    request: AnnotationNavigationRequest,
  ) => AnnotationNavigationState;
  onToggleSettings: () => void;
  readerChatOpen?: boolean;
};

export type ReaderShellState = ReturnType<typeof useReaderShellState>;

export function useReaderShellState({
  activeId,
  annotationRailLayoutOverride,
  annotations,
  articleId,
  articleRef,
  autoExpandNewAnnotations,
  boxes,
  canvasRef,
  commentsCloseKey,
  composer,
  filteredAnnotations,
  highlightChoice,
  noteRefs,
  readerContentWidth,
  selectionAction,
  selectionActionShortcuts,
  settingsOpen,
  surfaceRef,
  onAnnotationLayoutChange,
  onCancelComposer,
  onClearActiveAnnotation,
  onClearSelection,
  onCloseFloatingPanels,
  onCloseHighlightChoice,
  onCloseReaderChat,
  onAskSelection,
  onNavigateAnnotation,
  onOpenReaderChat,
  onOpenComposer,
  onResolveAnnotationNavigation,
  onToggleSettings,
  readerChatOpen,
}: UseReaderShellStateOptions) {
  const measuredAnnotationRailLayout = useAnnotationRailLayout(
    canvasRef,
    articleRef,
    articleId,
    readerContentWidth,
  );
  const annotationRailLayout = annotationRailLayoutOverride ?? measuredAnnotationRailLayout;
  const annotationRail = useReaderAnnotationRail({
    activeId,
    annotationRailLayout,
    annotations,
    articleId,
    autoExpandNewAnnotations,
    boxes,
    commentsCloseKey,
    filteredAnnotations,
    noteRefs,
    onAnnotationLayoutChange,
  });
  const shouldPreserveActiveAnnotationOnPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || boxes.length === 0) return false;

      const canvasRect = canvas.getBoundingClientRect();
      return (
        annotationIdsAtHighlightPoint(
          boxes,
          {
            x: event.clientX - canvasRect.left,
            y: event.clientY - canvasRect.top,
          },
          READER_HIGHLIGHT_POINTER_PRESERVE_PADDING,
        ).length > 0
      );
    },
    [boxes, canvasRef],
  );
  const [annotationNavigation, setAnnotationNavigation] = React.useState<AnnotationNavigationState>(
    () =>
      onResolveAnnotationNavigation?.({
        activeId,
        annotations: annotationRail.visibleAnnotations,
      }) ?? emptyAnnotationNavigation,
  );
  const [selectionCopyRequestKey, setSelectionCopyRequestKey] = React.useState(0);
  const requestSelectionCopy = React.useCallback(() => {
    setSelectionCopyRequestKey((key) => key + 1);
  }, []);
  const interactions = useReaderShellInteractions({
    activeId,
    composer,
    highlightChoice,
    selectionAction,
    selectionActionShortcuts,
    settingsOpen,
    visibleAnnotationIds: annotationRail.visibleAnnotationIds,
    onCancelComposer,
    onClearActiveAnnotation,
    onClearSelection,
    onCloseFloatingPanels,
    onCloseHighlightChoice,
    onCloseReaderChat,
    onAskSelection,
    onCopySelection: requestSelectionCopy,
    onOpenReaderChat,
    onOpenComposer,
    onToggleSettings,
    readerChatOpen,
    shouldPreserveActiveAnnotationOnPointerDown,
  });

  React.useEffect(() => {
    if (!onResolveAnnotationNavigation) {
      setAnnotationNavigation((current) =>
        sameAnnotationNavigation(current, emptyAnnotationNavigation)
          ? current
          : emptyAnnotationNavigation,
      );
      return;
    }
    const surface = surfaceRef.current;
    if (!surface) return;

    let frame = 0;
    const updateNavigation = () => {
      const nextNavigation =
        onResolveAnnotationNavigation({
          activeId,
          annotations: annotationRail.visibleAnnotations,
        }) ?? emptyAnnotationNavigation;
      setAnnotationNavigation((current) =>
        sameAnnotationNavigation(current, nextNavigation) ? current : nextNavigation,
      );
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateNavigation);
    };

    updateNavigation();
    surface.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      surface.removeEventListener('scroll', schedule);
    };
  }, [activeId, annotationRail.visibleAnnotations, onResolveAnnotationNavigation, surfaceRef]);

  const navigateAnnotation = React.useCallback(
    (direction: AnnotationNavigationDirection) => {
      const annotationId =
        direction === 'previous' ? annotationNavigation.previousId : annotationNavigation.nextId;
      if (!annotationId) return;
      onNavigateAnnotation?.(annotationId, direction);
    },
    [annotationNavigation.nextId, annotationNavigation.previousId, onNavigateAnnotation],
  );

  return {
    annotationNavigation,
    annotationRail,
    annotationRailLayout,
    handleReaderPointerDownCapture: interactions.handleReaderPointerDownCapture,
    navigateAnnotation,
    selectionCopyRequestKey,
    toggleSettings: interactions.toggleSettings,
  };
}

function useAnnotationRailLayout(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  articleRef: React.RefObject<HTMLElement | null>,
  articleId: string,
  contentWidth?: number,
) {
  const [layout, setLayout] = React.useState<AnnotationRailLayout>(stackedAnnotationRailLayout);

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const article = articleRef.current;
    if (!canvas || !article) {
      setLayout((current) =>
        sameAnnotationRailLayout(current, stackedAnnotationRailLayout)
          ? current
          : stackedAnnotationRailLayout,
      );
      return;
    }

    const updateLayout = () => {
      const nextLayout = measureAnnotationRailLayout(canvas, article, contentWidth);
      setLayout((current) =>
        sameAnnotationRailLayout(current, nextLayout) ? current : nextLayout,
      );
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', updateLayout);
      };
    }

    const observer = new ResizeObserver(updateLayout);
    observer.observe(canvas);
    observer.observe(article);
    return () => {
      window.removeEventListener('resize', updateLayout);
      observer.disconnect();
    };
  }, [articleId, articleRef, canvasRef, contentWidth]);

  return layout;
}

export function measureAnnotationRailLayout(
  canvas: HTMLDivElement,
  article: HTMLElement,
  contentWidth?: number,
): AnnotationRailLayout {
  const canvasRect = canvas.getBoundingClientRect();
  const articleRect = article.getBoundingClientRect();
  if (canvasRect.width <= 0 || articleRect.width <= 0) return stackedAnnotationRailLayout;

  const canvasWidth = Math.round(canvasRect.width);
  const targetArticleWidth = Math.min(
    positiveWidth(contentWidth) ?? computedReaderContentWidth(article) ?? articleRect.width,
    canvasWidth,
  );
  return annotationRailLayoutForWidth({
    canvasWidth,
    targetArticleWidth,
    railGap: READER_ANNOTATION_RAIL_GAP,
    railWidth: READER_ANNOTATION_RAIL_WIDTH,
  });
}

export function annotationRailLayoutForWidth({
  canvasWidth,
  minimumArticleWidth = READER_MIN_ASIDE_ARTICLE_WIDTH,
  minimumRailWidth = READER_MIN_ANNOTATION_RAIL_WIDTH,
  railGap = READER_ANNOTATION_RAIL_GAP,
  railWidth = READER_ANNOTATION_RAIL_WIDTH,
  targetArticleWidth,
}: {
  canvasWidth: number;
  minimumArticleWidth?: number;
  minimumRailWidth?: number;
  railGap?: number;
  railWidth?: number;
  targetArticleWidth: number;
}): AnnotationRailLayout {
  if (canvasWidth <= 0 || targetArticleWidth <= 0) return stackedAnnotationRailLayout;

  const articleWidth = Math.min(Math.round(targetArticleWidth), Math.round(canvasWidth));
  const fullSideSpace = railWidth + railGap;
  if (canvasWidth >= articleWidth + fullSideSpace * 2) {
    const articleLeft = Math.round((canvasWidth - articleWidth) / 2);
    const articleRight = articleLeft + articleWidth;
    return {
      articleCenterX: Math.round((articleLeft + articleRight) / 2),
      articleWidth,
      leftRailLeft: Math.round(articleLeft - fullSideSpace),
      mode: 'both',
      railWidth,
      rightRailLeft: Math.round(articleRight + railGap),
    };
  }

  const minimumSideSpace = minimumRailWidth + railGap;
  if (canvasWidth >= articleWidth + minimumSideSpace) {
    const availableRailWidth = Math.max(minimumRailWidth, canvasWidth - articleWidth - railGap);
    const rightRailWidth = Math.min(railWidth, availableRailWidth);
    return {
      articleCenterX: Math.round(articleWidth / 2),
      articleWidth,
      leftRailLeft: 0,
      mode: 'right',
      railWidth: Math.round(rightRailWidth),
      rightRailLeft: Math.round(articleWidth + railGap),
    };
  }

  const minimumReadableArticleWidth = Math.min(articleWidth, minimumArticleWidth);
  if (canvasWidth >= minimumReadableArticleWidth + minimumSideSpace) {
    const asideArticleWidth = Math.min(articleWidth, canvasWidth - minimumSideSpace);
    return {
      articleCenterX: Math.round(asideArticleWidth / 2),
      articleWidth: Math.round(asideArticleWidth),
      leftRailLeft: 0,
      mode: 'right',
      railWidth: minimumRailWidth,
      rightRailLeft: Math.round(asideArticleWidth + railGap),
    };
  }

  return {
    articleCenterX: Math.round(articleWidth / 2),
    articleWidth,
    leftRailLeft: 0,
    mode: 'stacked',
    railWidth: 0,
    rightRailLeft: 0,
  };
}

export function sameAnnotationRailLayout(left: AnnotationRailLayout, right: AnnotationRailLayout) {
  return (
    left.articleCenterX === right.articleCenterX &&
    left.articleWidth === right.articleWidth &&
    left.leftRailLeft === right.leftRailLeft &&
    left.mode === right.mode &&
    left.railWidth === right.railWidth &&
    left.rightRailLeft === right.rightRailLeft
  );
}

function computedReaderContentWidth(article: HTMLElement) {
  const value = window.getComputedStyle(article).getPropertyValue('--reader-content-width').trim();
  return positiveWidth(Number.parseFloat(value));
}

function positiveWidth(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function sameAnnotationNavigation(
  left: AnnotationNavigationState,
  right: AnnotationNavigationState,
) {
  return (
    left.currentIndex === right.currentIndex &&
    left.previousId === right.previousId &&
    left.nextId === right.nextId &&
    left.totalCount === right.totalCount
  );
}
