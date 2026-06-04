import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
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
  leftRailLeft: 0,
  mode: 'stacked',
  railWidth: 0,
  rightRailLeft: 0,
};

const emptyAnnotationNavigation: AnnotationNavigationState = {
  nextId: null,
  previousId: null,
};

export type UseReaderShellStateOptions = {
  activeId: string | null;
  annotationRailLayoutOverride?: AnnotationRailLayout;
  annotationRailViewportHeight?: number;
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
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onNavigateAnnotation?: (annotationId: string, direction: AnnotationNavigationDirection) => void;
  onOpenComposer: (action: SelectionAction) => void;
  onResolveAnnotationNavigation?: (
    request: AnnotationNavigationRequest,
  ) => AnnotationNavigationState;
  onToggleSettings: () => void;
};

export type ReaderShellState = ReturnType<typeof useReaderShellState>;

export function useReaderShellState({
  activeId,
  annotationRailLayoutOverride,
  annotationRailViewportHeight,
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
  onCopySelection,
  onNavigateAnnotation,
  onOpenComposer,
  onResolveAnnotationNavigation,
  onToggleSettings,
}: UseReaderShellStateOptions) {
  const measuredAnnotationRailLayout = useAnnotationRailLayout(canvasRef, articleRef, articleId);
  const annotationRailLayout = annotationRailLayoutOverride ?? measuredAnnotationRailLayout;
  const annotationRail = useReaderAnnotationRail({
    activeId,
    annotationRailLayout,
    annotationRailViewportHeight,
    annotations,
    articleId,
    autoExpandNewAnnotations,
    boxes,
    commentsCloseKey,
    filteredAnnotations,
    noteRefs,
    onAnnotationLayoutChange,
  });
  const [annotationNavigation, setAnnotationNavigation] = React.useState<AnnotationNavigationState>(
    () =>
      onResolveAnnotationNavigation?.({
        activeId,
        annotations: annotationRail.visibleAnnotations,
      }) ?? emptyAnnotationNavigation,
  );
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
    onCopySelection,
    onOpenComposer,
    onToggleSettings,
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
    toggleSettings: interactions.toggleSettings,
  };
}

function useAnnotationRailLayout(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  articleRef: React.RefObject<HTMLElement | null>,
  articleId: string,
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
      const nextLayout = measureAnnotationRailLayout(canvas, article);
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
  }, [articleId, articleRef, canvasRef]);

  return layout;
}

export function measureAnnotationRailLayout(
  canvas: HTMLDivElement,
  article: HTMLElement,
): AnnotationRailLayout {
  const canvasRect = canvas.getBoundingClientRect();
  const articleRect = article.getBoundingClientRect();
  if (canvasRect.width <= 0 || articleRect.width <= 0) return stackedAnnotationRailLayout;

  const gap = 20;
  const minimumRailWidth = 280;
  const maximumRailWidth = 420;
  const articleLeft = Math.max(0, Math.round(articleRect.left - canvasRect.left));
  const articleRight = Math.min(canvasRect.width, Math.round(articleRect.right - canvasRect.left));
  const leftSpace = articleLeft;
  const rightSpace = Math.max(0, Math.round(canvasRect.width - articleRight));
  const leftAvailable = leftSpace >= minimumRailWidth + gap;
  const rightAvailable = rightSpace >= minimumRailWidth + gap;
  if (!leftAvailable && !rightAvailable) {
    return {
      articleCenterX: Math.round((articleLeft + articleRight) / 2),
      leftRailLeft: 0,
      mode: 'stacked',
      railWidth: 0,
      rightRailLeft: Math.round(articleRight + gap),
    };
  }

  const mode = leftAvailable && rightAvailable ? 'both' : leftAvailable ? 'left' : 'right';
  const usableSpace =
    mode === 'both' ? Math.min(leftSpace, rightSpace) : mode === 'left' ? leftSpace : rightSpace;
  const railWidth = Math.min(maximumRailWidth, Math.max(minimumRailWidth, usableSpace - gap));
  return {
    articleCenterX: Math.round((articleLeft + articleRight) / 2),
    leftRailLeft: Math.round(articleLeft - gap - railWidth),
    mode,
    railWidth: Math.round(railWidth),
    rightRailLeft: Math.round(articleRight + gap),
  };
}

export function sameAnnotationRailLayout(left: AnnotationRailLayout, right: AnnotationRailLayout) {
  return (
    left.articleCenterX === right.articleCenterX &&
    left.leftRailLeft === right.leftRailLeft &&
    left.mode === right.mode &&
    left.railWidth === right.railWidth &&
    left.rightRailLeft === right.rightRailLeft
  );
}

export function sameAnnotationNavigation(
  left: AnnotationNavigationState,
  right: AnnotationNavigationState,
) {
  return left.previousId === right.previousId && left.nextId === right.nextId;
}
