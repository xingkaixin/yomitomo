import React from 'react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import type { HighlightChoice, PendingComposer, SelectionAction } from './reader-app-view-types';
import { selectionActionShortcut } from '../reader-shortcuts';

const activeAnnotationPreserveSelector = [
  'button',
  'textarea',
  'input',
  'select',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[data-reader-floating-panel]',
  '[data-reader-popover-anchor]',
  '.reader-floating-toolbar',
  '.reader-toolbar',
  '.reader-toc',
  '.reader-note',
  '.reader-highlight',
  '.reader-selection-menu',
  '.reader-composer',
  '.reader-highlight-choice-menu',
].join(',');

export type UseReaderShellInteractionsOptions = {
  activeId: string | null;
  composer: PendingComposer | null;
  highlightChoice: HighlightChoice | null;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  settingsOpen: boolean;
  visibleAnnotationIds: Set<string>;
  onCancelComposer: () => void;
  onClearActiveAnnotation: () => void;
  onClearSelection: () => void;
  onCloseFloatingPanels: () => void;
  onCloseHighlightChoice: () => void;
  onAskSelection?: (action: SelectionAction) => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onOpenComposer: (action: SelectionAction) => void;
  onToggleSettings: () => void;
};

export type ReaderShellInteractions = {
  handleReaderPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void;
  toggleSettings: () => void;
};

export function useReaderShellInteractions({
  activeId,
  composer,
  highlightChoice,
  selectionAction,
  selectionActionShortcuts,
  settingsOpen,
  visibleAnnotationIds,
  onCancelComposer,
  onClearActiveAnnotation,
  onClearSelection,
  onCloseFloatingPanels,
  onCloseHighlightChoice,
  onAskSelection,
  onCopySelection,
  onOpenComposer,
  onToggleSettings,
}: UseReaderShellInteractionsOptions): ReaderShellInteractions {
  React.useEffect(() => {
    if (!activeId || visibleAnnotationIds.has(activeId)) return;
    onCloseHighlightChoice();
    onClearActiveAnnotation();
  }, [activeId, onClearActiveAnnotation, onCloseHighlightChoice, visibleAnnotationIds]);

  React.useEffect(() => {
    if (!selectionAction || composer) return;
    const activeSelectionAction = selectionAction;

    function handleSelectionShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        return;
      }

      const shortcut = selectionActionShortcut(event, selectionActionShortcuts);
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'copy') {
        void Promise.resolve(onCopySelection(activeSelectionAction)).then(onClearSelection);
        return;
      }
      if (shortcut === 'ask' && onAskSelection) {
        onAskSelection(activeSelectionAction);
        return;
      }
      onOpenComposer(activeSelectionAction);
    }

    window.addEventListener('keydown', handleSelectionShortcut);
    return () => {
      window.removeEventListener('keydown', handleSelectionShortcut);
    };
  }, [
    composer,
    onAskSelection,
    onClearSelection,
    onCopySelection,
    onOpenComposer,
    selectionAction,
    selectionActionShortcuts,
  ]);

  const toggleSettings = React.useCallback(() => {
    onToggleSettings();
  }, [onToggleSettings]);

  const handleReaderPointerDownCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;

      if (settingsOpen) {
        if (!target.closest('[data-reader-floating-panel],[data-reader-popover-anchor]')) {
          onCloseFloatingPanels();
        }
      }

      if (composer && !target.closest('.reader-composer')) {
        onCancelComposer();
      }

      if (highlightChoice && !target.closest('.reader-highlight-choice-menu,.reader-highlight')) {
        onCloseHighlightChoice();
      }

      if (selectionAction && !target.closest('.reader-selection-menu')) {
        onClearSelection();
      }

      if (!activeId) return;
      if (target.closest(activeAnnotationPreserveSelector)) return;

      onCloseHighlightChoice();
      onClearActiveAnnotation();
    },
    [
      activeId,
      composer,
      highlightChoice,
      onCancelComposer,
      onClearActiveAnnotation,
      onClearSelection,
      onCloseFloatingPanels,
      onCloseHighlightChoice,
      settingsOpen,
      selectionAction,
    ],
  );

  return {
    handleReaderPointerDownCapture,
    toggleSettings,
  };
}
