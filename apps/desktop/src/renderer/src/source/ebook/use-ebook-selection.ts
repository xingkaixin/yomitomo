import { useCallback, type RefObject } from 'react';
import i18next from 'i18next';
import type { SelectionActionShortcuts, UserProfile } from '@yomitomo/shared';
import { createEpubTextAnchorFromQuote, selectionActionPosition } from '@yomitomo/core';
import { selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import {
  currentFoliateContent,
  ebookChapterForFoliateSection,
  foliateRangeHighlightBoxes,
  isRangeInsideDocumentBody,
  lastFoliateRangeViewportRect,
  selectionContextForRange,
  type FoliatePageInfo,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
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
  setStatusMessage,
}: UseEbookSelectionInput) {
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

      const content = currentFoliateContent(view);
      const sectionIndex = content?.index ?? pageInfo?.sectionIndex ?? 0;
      const chapter = ebookChapterForFoliateSection(article, view, sectionIndex);
      const context = selectionContextForRange(doc, range);
      const anchor =
        article.ebook.index && chapter
          ? createEpubTextAnchorFromQuote(article.ebook.index, ebookText, range.toString(), {
              chapterId: chapter.id,
              prefix: context.prefix,
              suffix: context.suffix,
            })
          : null;
      if (!anchor?.exact.trim()) {
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
        { x: position.x, y: position.y, anchor },
        foliateRangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
          Object.assign(box, {
            annotationId: '__selection__',
            contributorId: userProfile.id,
            color: userProfile.annotationColor,
          }),
        ),
      );
      selection.removeAllRanges();
    },
    [
      article,
      canvasRef,
      clearSelection,
      ebookText,
      openSelectionAction,
      pageInfo,
      setStatusMessage,
      userProfile,
      viewRef,
    ],
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
    handleFoliateSelection,
    handleFoliateSelectionShortcut,
  };
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!target || !('closest' in target)) return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  return typeof closest === 'function'
    ? Boolean(closest.call(target, 'input,textarea,select,[contenteditable="true"]'))
    : false;
}
