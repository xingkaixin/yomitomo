import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import i18next from 'i18next';
import type { SelectionActionShortcuts, UserProfile } from '@yomitomo/shared';
import {
  createEpubTextAnchorFromQuote,
  rangeIntersectsBilingualTranslation,
  selectionActionPosition,
  type HighlightBox,
} from '@yomitomo/core';
import type { SelectionAdjustmentPointer } from '@yomitomo/reader-ui/reader-app-view';
import { selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import {
  currentFoliateContent,
  currentFoliateContents,
  ebookChapterForFoliateSection,
  ebookHasStableSectionChapterMapping,
  foliateRangeHighlightBoxes,
  isRangeInsideDocumentBody,
  lastFoliateRangeViewportRect,
  normalizeRenderedText,
  rangeForEbookAnchorInDocument,
  selectionContextForRange,
  selectionTextForRange,
  type FoliatePageInfo,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  ebookSelectionPointFromClientPoint,
  ebookSelectionRangeFromOffsets,
  ebookSelectionRangeOffsets,
  type EbookSelectionAdjustment,
} from './ebook-selection-adjustment';
import {
  describeSelectionAdjustmentPoint,
  isAdjustableSelectionOffsetRange,
  selectionAdjustmentAdjustedOffsets,
  selectionAdjustmentDraggingHandle,
} from '../bookcase/selection-adjustment';
import type {
  EbookBookcaseProps,
  SourceSelectionAction,
} from '../bookcase/app-source-bookcase-shared';

type UseEbookSelectionInput = {
  article: EbookBookcaseProps['article'];
  canvasRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateViewElement | null>;
  pageInfo: FoliatePageInfo | null;
  ebookText: string;
  userProfile: UserProfile;
  actionShortcuts: SelectionActionShortcuts;
  selectionAction: SourceSelectionAction | null;
  composer: SourceSelectionAction | null;
  clearSelection: () => void;
  askSelection: (action: SourceSelectionAction) => void;
  requestSelectionCopy: () => void;
  openComposer: (action: SourceSelectionAction) => void;
  openSelectionAction: (
    action: SourceSelectionAction,
    boxes: ReturnType<typeof foliateRangeHighlightBoxes>,
  ) => void;
  setSelectionAction: Dispatch<SetStateAction<SourceSelectionAction | null>>;
  setTemporaryBoxes: Dispatch<SetStateAction<HighlightBox[]>>;
  setStatusMessage: (message: string) => void;
};

export function useEbookSelection({
  article,
  canvasRef,
  viewRef,
  pageInfo,
  ebookText,
  userProfile,
  actionShortcuts,
  selectionAction,
  composer,
  clearSelection,
  askSelection,
  requestSelectionCopy,
  openComposer,
  openSelectionAction,
  setSelectionAction,
  setTemporaryBoxes,
  setStatusMessage,
}: UseEbookSelectionInput) {
  const selectionAdjustmentRef = useRef<EbookSelectionAdjustment | null>(null);
  const selectionBoxesForRange = useCallback(
    (range: Range, canvasRect: DOMRect) =>
      foliateRangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
        Object.assign(box, {
          annotationId: '__selection__',
          contributorId: userProfile.id,
          color: userProfile.annotationColor,
        }),
      ),
    [userProfile.annotationColor, userProfile.id],
  );
  const createAnchorForFoliateRange = useCallback(
    (doc: Document, range: Range, sectionIndex: number) => {
      const view = viewRef.current;
      const chapter = view ? ebookChapterForFoliateSection(article, view, sectionIndex) : null;
      const context = selectionContextForRange(doc, range);
      const quote = selectionTextForRange(range);
      const constrainToChapter = ebookHasStableSectionChapterMapping(article) && Boolean(chapter);
      const anchor =
        article.ebook.index && (chapter || !constrainToChapter)
          ? createEpubTextAnchorFromQuote(article.ebook.index, ebookText, quote, {
              chapterId: constrainToChapter ? chapter?.id : undefined,
              prefix: context.prefix,
              suffix: context.suffix,
            })
          : null;

      return { anchor, chapter, constrainToChapter, quote };
    },
    [article, ebookText, viewRef],
  );
  const selectionAdjustmentTargetForAnchor = useCallback(
    (anchor: SourceSelectionAction['anchor']) => {
      const view = viewRef.current;
      if (!view) return null;

      for (const content of currentFoliateContents(view)) {
        const doc = content.doc;
        if (!doc?.body) continue;

        const range = rangeForEbookAnchorInDocument(doc, anchor);
        if (!range || !isRangeInsideDocumentBody(doc, range)) continue;

        const offsets = ebookSelectionRangeOffsets(doc.body, range);
        if (!offsets) continue;

        return {
          doc,
          sectionIndex: content.index ?? pageInfo?.sectionIndex ?? 0,
          startOffset: offsets.startOffset,
          endOffset: offsets.endOffset,
        };
      }

      return null;
    },
    [pageInfo?.sectionIndex, viewRef],
  );
  const handleFoliateSelection = useCallback(
    (doc: Document) => {
      const canvasElement = canvasRef.current;
      const view = viewRef.current;
      const selection = doc.getSelection();
      if (
        !canvasElement ||
        !view ||
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed
      ) {
        clearSelection();
        return;
      }

      const range = selection.getRangeAt(0);
      if (!isRangeInsideDocumentBody(doc, range)) return;
      if (rangeIntersectsBilingualTranslation(range)) {
        selection.removeAllRanges();
        clearSelection();
        return;
      }

      const content = foliateContentForDocument(view, doc);
      const sectionIndex = content?.index ?? pageInfo?.sectionIndex ?? 0;
      const { anchor, chapter, constrainToChapter, quote } = createAnchorForFoliateRange(
        doc,
        range,
        sectionIndex,
      );
      if (!anchor?.exact.trim()) {
        recordEbookSelectionDebug('locate_failed', {
          articleId: article.id,
          chapterId: chapter?.id,
          constrainToChapter,
          ebookTextChars: ebookText.length,
          format: article.ebook.metadata.format,
          hasIndex: Boolean(article.ebook.index),
          normalizedQuoteChars: normalizeRenderedText(quote).length,
          rawQuoteChars: range.toString().length,
          sectionIndex,
        });
        setStatusMessage(i18next.t('ebookReader.selectionLocateFailed'));
        window.setTimeout(() => setStatusMessage(''), 1800);
        selection.removeAllRanges();
        return;
      }

      const canvasRect = canvasElement.getBoundingClientRect();
      const lastRect = lastFoliateRangeViewportRect(range, canvasRect);
      if (!lastRect) return;

      const position = selectionActionPosition(lastRect, canvasRect);
      openSelectionAction(
        { x: position.x, y: position.y, anchor, adjustable: true },
        selectionBoxesForRange(range, canvasRect),
      );
      selection.removeAllRanges();
    },
    [
      article,
      canvasRef,
      clearSelection,
      createAnchorForFoliateRange,
      ebookText,
      openSelectionAction,
      pageInfo,
      selectionBoxesForRange,
      setStatusMessage,
      viewRef,
    ],
  );

  const startEbookSelectionAdjustment = useCallback(
    (point: SelectionAdjustmentPointer) => {
      const anchor = selectionAction?.anchor;
      if (!anchor || !canAdjustEbookSelectionAnchor(anchor)) {
        selectionAdjustmentRef.current = null;
        return;
      }

      const target = selectionAdjustmentTargetForAnchor(anchor);
      if (!target) {
        selectionAdjustmentRef.current = null;
        recordEbookSelectionDebug('handle_target_missing', {
          articleId: article.id,
          anchorStart: anchor.start,
          anchorEnd: anchor.end,
          format: article.ebook.metadata.format,
          pointer: describeSelectionAdjustmentPoint(point),
        });
        return;
      }

      selectionAdjustmentRef.current = {
        ...target,
        handle: point.handle,
      };
      recordEbookSelectionDebug('handle_start', {
        articleId: article.id,
        anchorStart: anchor.start,
        anchorEnd: anchor.end,
        format: article.ebook.metadata.format,
        handle: point.handle,
        sectionIndex: target.sectionIndex,
        pointer: describeSelectionAdjustmentPoint(point),
      });
    },
    [
      article.id,
      article.ebook.metadata.format,
      selectionAction,
      selectionAdjustmentTargetForAnchor,
    ],
  );

  const commitEbookSelectionAdjustment = useCallback(
    ({
      canvasElement,
      draggingHandle,
      range,
      sectionIndex,
    }: {
      canvasElement: HTMLElement;
      draggingHandle: SourceSelectionAction['draggingHandle'];
      range: Range;
      sectionIndex: number;
    }) => {
      const doc = range.startContainer.ownerDocument;
      if (!doc) return;

      const { anchor } = createAnchorForFoliateRange(doc, range, sectionIndex);
      if (!anchor?.exact.trim()) return;

      const canvasRect = canvasElement.getBoundingClientRect();
      const lastRect = lastFoliateRangeViewportRect(range, canvasRect);
      if (!lastRect) return;

      const position = selectionActionPosition(lastRect, canvasRect);
      setSelectionAction({
        x: position.x,
        y: position.y,
        anchor,
        adjustable: true,
        draggingHandle,
      });
      setTemporaryBoxes(selectionBoxesForRange(range, canvasRect));
    },
    [createAnchorForFoliateRange, selectionBoxesForRange, setSelectionAction, setTemporaryBoxes],
  );

  const updateEbookSelectionAdjustment = useCallback(
    (point: SelectionAdjustmentPointer) => {
      const adjustment = selectionAdjustmentRef.current;
      const canvasElement = canvasRef.current;
      if (!adjustment || adjustment.handle !== point.handle || !canvasElement) return;

      const targetPoint = ebookSelectionPointFromClientPoint(
        adjustment.doc,
        point.clientX,
        point.clientY,
      );
      if (!targetPoint || !adjustment.doc.body) return;

      const nextOffsets = selectionAdjustmentAdjustedOffsets(adjustment, targetPoint.sourceOffset);
      if (!nextOffsets) return;

      const range = ebookSelectionRangeFromOffsets(
        adjustment.doc.body,
        nextOffsets.startOffset,
        nextOffsets.endOffset,
      );
      if (!range || range.collapsed || !isRangeInsideDocumentBody(adjustment.doc, range)) return;

      commitEbookSelectionAdjustment({
        canvasElement,
        draggingHandle: selectionAdjustmentDraggingHandle(adjustment, targetPoint.sourceOffset),
        range,
        sectionIndex: adjustment.sectionIndex,
      });
    },
    [canvasRef, commitEbookSelectionAdjustment],
  );

  const finishEbookSelectionAdjustment = useCallback(
    (point: SelectionAdjustmentPointer) => {
      updateEbookSelectionAdjustment(point);
      const adjustment = selectionAdjustmentRef.current;
      selectionAdjustmentRef.current = null;
      recordEbookSelectionDebug('handle_end', {
        articleId: article.id,
        adjusted: Boolean(adjustment),
        format: article.ebook.metadata.format,
        handle: point.handle,
        pointer: describeSelectionAdjustmentPoint(point),
      });
      setSelectionAction((action) =>
        action?.draggingHandle ? { ...action, draggingHandle: undefined } : action,
      );
    },
    [article.id, article.ebook.metadata.format, setSelectionAction, updateEbookSelectionAdjustment],
  );

  const handleFoliateSelectionShortcut = useCallback(
    (event: KeyboardEvent) => {
      const activeSelectionAction = selectionAction;
      if (!activeSelectionAction || composer || event.defaultPrevented) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const shortcut = selectionActionShortcut(event, actionShortcuts);
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'copy') {
        requestSelectionCopy();
        return;
      }
      if (shortcut === 'ask') {
        askSelection(activeSelectionAction);
        return;
      }
      openComposer(activeSelectionAction);
    },
    [
      actionShortcuts,
      askSelection,
      clearSelection,
      composer,
      requestSelectionCopy,
      openComposer,
      selectionAction,
    ],
  );

  return {
    finishEbookSelectionAdjustment,
    handleFoliateSelection,
    handleFoliateSelectionShortcut,
    startEbookSelectionAdjustment,
    updateEbookSelectionAdjustment,
  };
}

function foliateContentForDocument(view: FoliateViewElement, doc: Document) {
  return (
    currentFoliateContents(view).find((content) => content.doc === doc) ??
    currentFoliateContent(view)
  );
}

function recordEbookSelectionDebug(event: string, data: Record<string, unknown>) {
  void window.yomitomoDesktop?.recordPerformanceTiming?.({
    event: `ebook_selection_debug.${event}`,
    data,
  });
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!target || !('closest' in target)) return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  return typeof closest === 'function'
    ? Boolean(closest.call(target, 'input,textarea,select,[contenteditable="true"]'))
    : false;
}

function canAdjustEbookSelectionAnchor(anchor: SourceSelectionAction['anchor']) {
  if ('kind' in anchor && anchor.kind === 'pdf-text') return false;
  return (
    anchor.exact.trim().length > 0 && isAdjustableSelectionOffsetRange(anchor.start, anchor.end)
  );
}
