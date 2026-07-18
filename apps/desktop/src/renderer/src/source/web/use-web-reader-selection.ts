import type React from 'react';
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  createTranslationTextAnchor,
  createEpubTextAnchor,
  getArticleSelection,
  isRangeInsideArticle,
  offsetFromArticleStartIgnoringSelector,
  rangeFromOffsets,
  rangeFromOffsetsIgnoringSelector,
  rangeHighlightBoxes,
  selectionActionPosition,
  translationElementForRange,
  type HighlightBox,
} from '@yomitomo/core';
import type {
  SelectionAction,
  SelectionAdjustmentHandle,
  SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';
import { appToast } from '../../shell/app-toast';
import { isContinuousTextSelectionMouseEvent } from '../bookcase/source-reader-selection-events';
import {
  describeSelectionAdjustmentPoint,
  selectionAdjustmentAdjustedOffsets,
  selectionAdjustmentDraggingHandle,
} from '../bookcase/selection-adjustment';
import {
  describeAnchorForDebug,
  describeHighlightBoxesForDebug,
  describePointerForDebug,
  describeRangeForDebug,
  describeReaderSelection,
  describeSelectionNode,
  logReaderSelectionDebug,
  readerSelectionDebugEnabled,
  shouldLogSelectionDebug,
} from './web-reader-selection-debug';
import {
  shouldUseWebSelectionGesturePreview,
  shouldUseWebSelectionGestureRange,
  webSelectionGesturePointFromClientPoint,
  webSelectionGestureRangeFromClientPoint,
  webTranslationSelectionGesturePointFromClientPoint,
  type WebSelectionGesturePoint,
  type WebSelectionGestureRange,
} from './web-reader-selection-gesture';
import {
  canAdjustWebSelectionAnchor,
  webSelectionAdjustmentKind,
  type WebSelectionAdjustment,
} from './web-selection-adjustment';

const selectionDragAnnotationId = '__selection_drag__';
const translationSelector = '[data-reader-translation]';
const translationSelectionToastIgnoredSelector =
  '[data-reader-translation-action], a[href], button, input, textarea, select, [role="button"]';

type SelectionGestureClientPoint = {
  clientX: number;
  clientY: number;
};

type WebReaderSelectionController = {
  clearSelection: () => void;
  composer: SelectionAction | null;
  openSelectionAction: (action: SelectionAction, boxes: HighlightBox[]) => void;
  selectionAction: SelectionAction | null;
  setSelectionAction: Dispatch<SetStateAction<SelectionAction | null>>;
  setTemporaryBoxes: Dispatch<SetStateAction<HighlightBox[]>>;
  temporaryBoxes: HighlightBox[];
};

type WebReaderTranslationSelection = {
  debugContext: () => Record<string, unknown>;
  selection: {
    finish: (reason: string) => void;
    isDisabled: boolean;
    showDisabledToast: () => void;
    start: (reason: string) => void;
  };
};

type UseWebReaderSelectionInput = {
  article: ArticleRecord;
  articleRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  getArticleText: () => string;
  scrollRef: RefObject<HTMLElement | null>;
  selection: WebReaderSelectionController;
  translation: WebReaderTranslationSelection;
  userProfile: UserProfile;
};

export function useWebReaderSelection({
  article,
  articleRef,
  canvasRef,
  getArticleText,
  scrollRef,
  selection,
  translation,
  userProfile,
}: UseWebReaderSelectionInput) {
  const { t } = useTranslation();
  const inputRef = useRef({ article, getArticleText, selection, t, translation, userProfile });
  const selectionGestureRef = useRef<WebSelectionGesturePoint | null>(null);
  const selectionGestureDragPointRef = useRef<SelectionGestureClientPoint | null>(null);
  const selectionAdjustmentRef = useRef<WebSelectionAdjustment | null>(null);
  const suppressMouseUpRef = useRef(false);
  inputRef.current = { article, getArticleText, selection, t, translation, userProfile };

  const debugContext = useCallback(() => {
    const current = inputRef.current;
    return {
      articleId: current.article.id,
      sourceType: current.article.sourceType || 'web',
      ...current.translation.debugContext(),
      composerOpen: Boolean(current.selection.composer),
      selectionActionOpen: Boolean(current.selection.selectionAction),
      temporaryBoxCount: current.selection.temporaryBoxes.length,
    };
  }, []);

  const logCurrentDebug = useCallback(
    (event: string, details: Record<string, unknown> = {}) => {
      const articleElement = articleRef.current;
      logReaderSelectionDebug(event, {
        ...debugContext(),
        selection: articleElement
          ? describeReaderSelection(getArticleSelection(articleElement), articleElement)
          : { present: false, articleMounted: false },
        ...details,
      });
    },
    [articleRef, debugContext],
  );

  const setSelectionGestureVisible = useCallback(
    (isVisible: boolean) => {
      articleRef.current?.classList.toggle('is-web-selection-gesture', isVisible);
    },
    [articleRef],
  );

  const removeSelectionGesturePreviewBoxes = useCallback(() => {
    inputRef.current.selection.setTemporaryBoxes((currentBoxes) => {
      if (!currentBoxes.some((box) => box.annotationId === selectionDragAnnotationId)) {
        return currentBoxes;
      }
      return currentBoxes.filter((box) => box.annotationId !== selectionDragAnnotationId);
    });
  }, []);

  const clearSelectionGesturePreview = useCallback(() => {
    setSelectionGestureVisible(false);
    removeSelectionGesturePreviewBoxes();
  }, [removeSelectionGesturePreviewBoxes, setSelectionGestureVisible]);

  const previewSelectionGesture = useCallback(() => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    const selectionGesture = selectionGestureRef.current;
    const dragPoint = selectionGestureDragPointRef.current;
    if (!articleElement || !canvasElement || !selectionGesture || !dragPoint) return;

    const gestureRange = webSelectionGestureRangeFromClientPoint(
      articleElement,
      selectionGesture,
      dragPoint.clientX,
      dragPoint.clientY,
    );
    if (!gestureRange) {
      removeSelectionGesturePreviewBoxes();
      return;
    }

    const current = inputRef.current;
    const canvasRect = canvasElement.getBoundingClientRect();
    const previewBoxes = rangeHighlightBoxes(
      gestureRange.range,
      canvasRect,
      'source-selection-drag',
    ).map((box) =>
      Object.assign(box, {
        annotationId: selectionDragAnnotationId,
        contributorId: current.userProfile.id,
        color: current.userProfile.annotationColor,
      }),
    );
    current.selection.setTemporaryBoxes(previewBoxes);
  }, [articleRef, canvasRef, removeSelectionGesturePreviewBoxes]);

  useEffect(() => {
    const ownerDocument = articleRef.current?.ownerDocument || document;
    let debugFrame = 0;
    let previewFrame = 0;
    selectionGestureRef.current = null;
    selectionGestureDragPointRef.current = null;
    selectionAdjustmentRef.current = null;
    suppressMouseUpRef.current = false;

    const debugArticle = { articleId: article.id, sourceType: article.sourceType || 'web' };
    const currentOpenState = () => {
      const current = inputRef.current.selection;
      return {
        composerOpen: Boolean(current.composer),
        selectionActionOpen: Boolean(current.selectionAction),
      };
    };

    const logSelectionState = (event: string, details: Record<string, unknown> = {}) => {
      if (!readerSelectionDebugEnabled()) return;
      const articleElement = articleRef.current;
      if (!articleElement) return;
      logReaderSelectionDebug(event, {
        ...debugContext(),
        selection: describeReaderSelection(getArticleSelection(articleElement), articleElement),
        ...details,
      });
    };

    const handleSelectionChange = () => {
      if (!readerSelectionDebugEnabled() || debugFrame) return;
      debugFrame = window.requestAnimationFrame(() => {
        debugFrame = 0;
        const articleElement = articleRef.current;
        if (!articleElement) return;
        const nativeSelection = getArticleSelection(articleElement);
        if (!shouldLogSelectionDebug(nativeSelection, articleElement, currentOpenState())) return;
        logReaderSelectionDebug('selectionchange', {
          ...debugContext(),
          selection: describeReaderSelection(nativeSelection, articleElement),
        });
      });
    };

    const handlePointerEvent = (event: PointerEvent) => {
      const articleElement = articleRef.current;
      const surfaceElement = scrollRef.current;
      if (!articleElement) return;
      const targetNode = event.target instanceof Node ? event.target : null;
      const nativeSelection = getArticleSelection(articleElement);
      const isInsideReader = Boolean(
        targetNode && (articleElement.contains(targetNode) || surfaceElement?.contains(targetNode)),
      );
      const shouldFinishTranslationSelection =
        event.type === 'pointerup' || event.type === 'pointercancel';
      const currentTranslation = inputRef.current.translation.selection;

      if (targetNode && articleElement.contains(targetNode)) {
        if (event.type === 'pointerdown') {
          currentTranslation.start('pointerdown');
          selectionGestureRef.current = webSelectionGesturePointFromClientPoint(
            articleElement,
            event.clientX,
            event.clientY,
          );
          selectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
          setSelectionGestureVisible(
            shouldUseWebSelectionGesturePreview(selectionGestureRef.current),
          );
        }
        if (
          event.type === 'pointermove' &&
          selectionGestureRef.current &&
          shouldUseWebSelectionGesturePreview(selectionGestureRef.current) &&
          event.buttons === 1
        ) {
          selectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
          if (!previewFrame) {
            previewFrame = window.requestAnimationFrame(() => {
              previewFrame = 0;
              previewSelectionGesture();
            });
          }
        }
        if (event.type === 'pointerup') {
          selectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
        }
        if (event.type === 'pointercancel') {
          selectionGestureRef.current = null;
          selectionGestureDragPointRef.current = null;
          clearSelectionGesturePreview();
        }
        if (shouldFinishTranslationSelection) currentTranslation.finish(event.type);
      } else if (shouldFinishTranslationSelection) {
        currentTranslation.finish(`${event.type}-outside-article`);
        clearSelectionGesturePreview();
      } else if (event.type === 'pointerdown') {
        selectionGestureRef.current = null;
        selectionGestureDragPointRef.current = null;
        clearSelectionGesturePreview();
      }

      if (event.type === 'pointermove' || !readerSelectionDebugEnabled()) return;
      if (
        !isInsideReader &&
        !shouldLogSelectionDebug(nativeSelection, articleElement, currentOpenState())
      ) {
        return;
      }
      logReaderSelectionDebug(event.type, {
        ...debugContext(),
        button: event.button,
        buttons: event.buttons,
        pointer: describePointerForDebug(event, articleElement, surfaceElement),
        target: describeSelectionNode(targetNode, articleElement),
        selection: describeReaderSelection(nativeSelection, articleElement),
      });
    };

    const handleWindowBlur = () => inputRef.current.translation.selection.finish('window-blur');

    logSelectionState('reader-mounted');
    ownerDocument.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('pointerdown', handlePointerEvent, true);
    window.addEventListener('pointermove', handlePointerEvent, true);
    window.addEventListener('pointerup', handlePointerEvent, true);
    window.addEventListener('pointercancel', handlePointerEvent, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      ownerDocument.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('pointerdown', handlePointerEvent, true);
      window.removeEventListener('pointermove', handlePointerEvent, true);
      window.removeEventListener('pointerup', handlePointerEvent, true);
      window.removeEventListener('pointercancel', handlePointerEvent, true);
      window.removeEventListener('blur', handleWindowBlur);
      if (debugFrame) window.cancelAnimationFrame(debugFrame);
      if (previewFrame) window.cancelAnimationFrame(previewFrame);
      setSelectionGestureVisible(false);
      logReaderSelectionDebug('reader-unmounted', debugArticle);
    };
  }, [
    article.id,
    article.sourceType,
    articleRef,
    clearSelectionGesturePreview,
    debugContext,
    previewSelectionGesture,
    scrollRef,
    setSelectionGestureVisible,
  ]);

  const onMouseUp = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      clearSelectionGesturePreview();
      const articleElement = articleRef.current;
      const canvasElement = canvasRef.current;
      if (!articleElement || !canvasElement) {
        logCurrentDebug('mouseup:missing-elements', {
          hasArticle: Boolean(articleElement),
          hasCanvas: Boolean(canvasElement),
        });
        return;
      }

      const current = inputRef.current;
      const articleSelection = getArticleSelection(articleElement);
      logReaderSelectionDebug('mouseup:start', {
        ...debugContext(),
        target: describeSelectionNode(
          event?.target instanceof Node ? event.target : null,
          articleElement,
        ),
        selection: describeReaderSelection(articleSelection, articleElement),
      });
      const selectionGesture = selectionGestureRef.current;
      selectionGestureRef.current = null;
      selectionGestureDragPointRef.current = null;
      if (suppressMouseUpRef.current) {
        suppressMouseUpRef.current = false;
        articleSelection?.removeAllRanges();
        current.selection.clearSelection();
        logReaderSelectionDebug('mouseup:continuous-click-selection-suppressed', {
          ...debugContext(),
          selection: describeReaderSelection(articleSelection, articleElement),
        });
        return;
      }

      const gestureRange = event
        ? webSelectionGestureRangeFromClientPoint(
            articleElement,
            selectionGesture,
            event.clientX,
            event.clientY,
          )
        : null;
      const nativeRange =
        articleSelection && articleSelection.rangeCount > 0 && !articleSelection.isCollapsed
          ? articleSelection.getRangeAt(0)
          : null;
      const shouldUseGestureRange =
        nativeRange && selectionGesture && gestureRange
          ? shouldUseWebSelectionGestureRange(
              nativeRange,
              articleElement,
              selectionGesture,
              gestureRange,
            )
          : !nativeRange && Boolean(gestureRange);
      const range = shouldUseGestureRange ? gestureRange?.range || null : nativeRange;

      if (shouldUseGestureRange && gestureRange) {
        logReaderSelectionDebug('mouseup:gesture-range-used', {
          ...debugContext(),
          reason: nativeRange ? 'native-anchor-mismatch' : 'native-empty',
          nativeRange: nativeRange ? describeRangeForDebug(nativeRange, articleElement) : null,
          gestureRange: describeWebSelectionGestureRangeForDebug(gestureRange),
        });
      }

      if (!range) {
        // The composer owns its highlight until the shell handles the blank click.
        logReaderSelectionDebug('mouseup:empty-selection', {
          ...debugContext(),
          clearedUiSelection: !current.selection.composer,
          selection: describeReaderSelection(articleSelection, articleElement),
        });
        if (!current.selection.composer) current.selection.clearSelection();
        return;
      }
      if (current.translation.selection.isDisabled) {
        logReaderSelectionDebug('mouseup:translation-selection-disabled', {
          ...debugContext(),
          selection: describeReaderSelection(articleSelection, articleElement),
        });
        articleSelection?.removeAllRanges();
        current.selection.clearSelection();
        current.translation.selection.showDisabledToast();
        return;
      }
      if (!isRangeInsideArticle(range, articleElement)) {
        logReaderSelectionDebug('mouseup:range-outside-article', {
          ...debugContext(),
          range: describeRangeForDebug(range, articleElement),
        });
        return;
      }

      const translationElement = translationElementForRange(range);
      if (!translationElement && rangeIntersectsSelector(range, translationSelector)) {
        logReaderSelectionDebug('mouseup:mixed-source-translation', {
          ...debugContext(),
          range: describeRangeForDebug(range, articleElement),
        });
        articleSelection?.removeAllRanges();
        current.selection.clearSelection();
        appToast.warning(current.t('source.mixedSelectionToast'));
        return;
      }

      const anchor = translationElement
        ? createTranslationTextAnchor(range, translationElement)
        : sourceAnchorForRange(current.article, current.getArticleText(), articleElement, range);
      if (!anchor) {
        logReaderSelectionDebug('mouseup:anchor-missing', {
          ...debugContext(),
          range: describeRangeForDebug(range, articleElement),
        });
        return;
      }
      if (!anchor.exact.trim()) {
        logReaderSelectionDebug('mouseup:blank-anchor', {
          ...debugContext(),
          anchor: describeAnchorForDebug(anchor),
          range: describeRangeForDebug(range, articleElement),
        });
        return;
      }

      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      if (!lastRect) {
        logReaderSelectionDebug('mouseup:missing-rect', {
          ...debugContext(),
          anchor: describeAnchorForDebug(anchor),
          range: describeRangeForDebug(range, articleElement),
        });
        return;
      }

      const canvasRect = canvasElement.getBoundingClientRect();
      const position = selectionActionPosition(lastRect, canvasRect);
      const highlightBoxes = selectionHighlightBoxes(
        range,
        canvasRect,
        current.userProfile,
        'source-selection',
      );
      current.selection.openSelectionAction(
        {
          x: position.x,
          y: position.y,
          anchor,
          adjustable: canAdjustWebSelectionAnchor(anchor),
        },
        highlightBoxes,
      );
      logReaderSelectionDebug('mouseup:selection-action-opened', {
        ...debugContext(),
        anchor: describeAnchorForDebug(anchor),
        range: describeRangeForDebug(range, articleElement),
        boxes: describeHighlightBoxesForDebug(highlightBoxes),
        position,
        rectCount: rects.length,
      });
      articleSelection?.removeAllRanges();
      logCurrentDebug('mouseup:native-selection-cleared');
    },
    [articleRef, canvasRef, clearSelectionGesturePreview, debugContext, logCurrentDebug],
  );

  const suppressContinuousTextSelection = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isContinuousTextSelectionMouseEvent(event)) {
        suppressMouseUpRef.current = false;
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(translationSelectionToastIgnoredSelector)) return;

      event.preventDefault();
      suppressMouseUpRef.current = true;
      selectionGestureRef.current = null;
      selectionGestureDragPointRef.current = null;
      clearSelectionGesturePreview();

      const articleElement = articleRef.current;
      if (!articleElement) return;
      getArticleSelection(articleElement)?.removeAllRanges();
      inputRef.current.selection.clearSelection();
      logCurrentDebug('mousedown:continuous-click-selection-suppressed', {
        clickDetail: event.detail,
      });
    },
    [articleRef, clearSelectionGesturePreview, logCurrentDebug],
  );

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      suppressContinuousTextSelection(event);
      const currentTranslation = inputRef.current.translation.selection;
      if (!currentTranslation.isDisabled || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(translationSelectionToastIgnoredSelector)) return;
      currentTranslation.showDisabledToast();
    },
    [suppressContinuousTextSelection],
  );

  const commitSelectionAdjustment = useCallback(
    (
      anchor: Annotation['anchor'],
      range: Range,
      canvasElement: HTMLElement,
      draggingHandle: SelectionAdjustmentHandle,
    ) => {
      if (!anchor.exact.trim()) return;
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      if (!lastRect) return;

      const current = inputRef.current;
      const canvasRect = canvasElement.getBoundingClientRect();
      const position = selectionActionPosition(lastRect, canvasRect);
      const highlightBoxes = selectionHighlightBoxes(
        range,
        canvasRect,
        current.userProfile,
        'source-selection',
      );
      current.selection.setSelectionAction({
        x: position.x,
        y: position.y,
        anchor,
        adjustable: true,
        draggingHandle,
      });
      current.selection.setTemporaryBoxes(highlightBoxes);
    },
    [],
  );

  const updateSelectionAdjustment = useCallback(
    (point: SelectionAdjustmentPointer) => {
      const adjustment = selectionAdjustmentRef.current;
      const articleElement = articleRef.current;
      const canvasElement = canvasRef.current;
      if (!adjustment || adjustment.handle !== point.handle || !articleElement || !canvasElement) {
        return;
      }

      if (adjustment.kind === 'translation') {
        const targetPoint = webTranslationSelectionGesturePointFromClientPoint(
          articleElement,
          adjustment.translationBlockId,
          point.clientX,
          point.clientY,
        );
        if (!targetPoint) return;
        const nextOffsets = selectionAdjustmentAdjustedOffsets(
          adjustment,
          targetPoint.translationOffset,
        );
        if (!nextOffsets) return;
        const range = rangeFromOffsets(
          targetPoint.translationElement,
          nextOffsets.startOffset,
          nextOffsets.endOffset,
        );
        if (!range || range.collapsed) return;
        const anchor = createTranslationTextAnchor(range, targetPoint.translationElement);
        if (!anchor) return;
        commitSelectionAdjustment(
          anchor,
          range,
          canvasElement,
          selectionAdjustmentDraggingHandle(adjustment, targetPoint.translationOffset),
        );
        return;
      }

      const targetPoint = webSelectionGesturePointFromClientPoint(
        articleElement,
        point.clientX,
        point.clientY,
      );
      if (!targetPoint || targetPoint.translationBlockId) return;
      const nextOffsets = selectionAdjustmentAdjustedOffsets(adjustment, targetPoint.sourceOffset);
      if (!nextOffsets) return;
      const range = rangeFromOffsetsIgnoringSelector(
        articleElement,
        nextOffsets.startOffset,
        nextOffsets.endOffset,
        translationSelector,
      );
      if (!range || range.collapsed) return;
      const current = inputRef.current;
      const anchor = sourceAnchorFromOffsets(
        current.article,
        current.getArticleText(),
        nextOffsets.startOffset,
        nextOffsets.endOffset,
      );
      commitSelectionAdjustment(
        anchor,
        range,
        canvasElement,
        selectionAdjustmentDraggingHandle(adjustment, targetPoint.sourceOffset),
      );
    },
    [articleRef, canvasRef, commitSelectionAdjustment],
  );

  const onSelectionHandleDragStart = useCallback(
    (point: SelectionAdjustmentPointer) => {
      const anchor = inputRef.current.selection.selectionAction?.anchor;
      const kind = anchor ? webSelectionAdjustmentKind(anchor) : null;
      if (!anchor || !kind || !canAdjustWebSelectionAnchor(anchor)) {
        selectionAdjustmentRef.current = null;
        return;
      }

      selectionAdjustmentRef.current =
        kind === 'translation'
          ? {
              kind,
              handle: point.handle,
              startOffset: anchor.start,
              endOffset: anchor.end,
              translationBlockId: anchor.segmentId || '',
            }
          : {
              kind,
              handle: point.handle,
              startOffset: anchor.start,
              endOffset: anchor.end,
            };
      logReaderSelectionDebug('selection-handle:start', {
        ...debugContext(),
        kind,
        handle: point.handle,
        anchor: describeAnchorForDebug(anchor),
        pointer: describeSelectionAdjustmentPoint(point),
      });
    },
    [debugContext],
  );

  const onSelectionHandleDragEnd = useCallback(
    (point: SelectionAdjustmentPointer) => {
      updateSelectionAdjustment(point);
      const adjustment = selectionAdjustmentRef.current;
      selectionAdjustmentRef.current = null;
      logReaderSelectionDebug('selection-handle:end', {
        ...debugContext(),
        handle: point.handle,
        pointer: describeSelectionAdjustmentPoint(point),
        adjusted: Boolean(adjustment),
      });
      inputRef.current.selection.setSelectionAction((action) =>
        action?.draggingHandle ? { ...action, draggingHandle: undefined } : action,
      );
    },
    [debugContext, updateSelectionAdjustment],
  );

  return {
    actions: {
      onMouseDown,
      onMouseUp,
      onSelectionHandleDrag: updateSelectionAdjustment,
      onSelectionHandleDragEnd,
      onSelectionHandleDragStart,
    },
    debug: {
      context: debugContext,
      logCurrent: logCurrentDebug,
    },
  };
}

function sourceAnchorForRange(
  article: ArticleRecord,
  articleText: string,
  articleElement: HTMLElement,
  range: Range,
) {
  const start = offsetFromArticleStartIgnoringSelector(
    articleElement,
    range.startContainer,
    range.startOffset,
    translationSelector,
  );
  const end = offsetFromArticleStartIgnoringSelector(
    articleElement,
    range.endContainer,
    range.endOffset,
    translationSelector,
  );
  return sourceAnchorFromOffsets(article, articleText, start, end);
}

function sourceAnchorFromOffsets(
  article: ArticleRecord,
  articleText: string,
  start: number,
  end: number,
) {
  return article.ebook?.index
    ? createEpubTextAnchor(article.ebook.index, articleText, start, end)
    : createTextAnchor(articleText, start, end);
}

function selectionHighlightBoxes(
  range: Range,
  canvasRect: DOMRect,
  userProfile: UserProfile,
  id: string,
) {
  return rangeHighlightBoxes(range, canvasRect, id).map((box) =>
    Object.assign(box, {
      annotationId: '__selection__',
      contributorId: userProfile.id,
      color: userProfile.annotationColor,
    }),
  );
}

function rangeIntersectsSelector(range: Range, selector: string) {
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

function describeWebSelectionGestureRangeForDebug(gestureRange: WebSelectionGestureRange) {
  return {
    startOffset: gestureRange.startOffset,
    endOffset: gestureRange.endOffset,
    startPoint: describeWebSelectionGesturePointForDebug(gestureRange.startPoint),
    endPoint: describeWebSelectionGesturePointForDebug(gestureRange.endPoint),
  };
}

function describeWebSelectionGesturePointForDebug(point: WebSelectionGesturePoint) {
  return {
    clientX: Math.round(point.clientX),
    clientY: Math.round(point.clientY),
    sourceOffset: point.sourceOffset,
    translationBlockId: point.translationBlockId,
  };
}
