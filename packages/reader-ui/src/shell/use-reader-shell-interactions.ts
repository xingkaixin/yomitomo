import React from 'react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import type {
  HighlightChoice,
  PendingComposer,
  ReaderChatActivationSource,
  SelectionAction,
} from './reader-app-view-types';
import { selectionActionShortcut } from '../reader-shortcuts';
import { useEventListener } from '../hooks/use-event-listener';

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
  '.reader-selection-handle',
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
  onCloseReaderChat?: (source: ReaderChatActivationSource) => void;
  onAskSelection?: (action: SelectionAction, source: ReaderChatActivationSource) => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onOpenReaderChat?: (source: ReaderChatActivationSource) => void;
  onOpenComposer: (action: SelectionAction) => void;
  onToggleSettings: () => void;
  readerChatOpen?: boolean;
  shouldPreserveActiveAnnotationOnPointerDown?: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => boolean;
};

export type ReaderShellInteractions = {
  /** Clears the active annotation when filters hide it; call it after commits that change either input. */
  clearHiddenActiveAnnotation: () => void;
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
  onCloseReaderChat,
  onAskSelection,
  onCopySelection,
  onOpenReaderChat,
  onOpenComposer,
  onToggleSettings,
  readerChatOpen = false,
  shouldPreserveActiveAnnotationOnPointerDown,
}: UseReaderShellInteractionsOptions): ReaderShellInteractions {
  const clearActiveAnnotation = React.useEffectEvent(() => {
    onCloseHighlightChoice();
    onClearActiveAnnotation();
  });

  const clearHiddenActiveAnnotation = React.useCallback(() => {
    if (!activeId || visibleAnnotationIds.has(activeId)) return;
    clearActiveAnnotation();
  }, [activeId, visibleAnnotationIds]);

  useEventListener(selectionAction && !composer ? window : null, 'keydown', (event) => {
    if (!selectionAction || event.defaultPrevented) return;
    if (isEditableKeyboardTarget(event.target)) return;

    const shortcut = selectionActionShortcut(event, selectionActionShortcuts);
    if (!shortcut) return;

    event.preventDefault();
    event.stopPropagation();
    if (shortcut === 'copy') {
      void onCopySelection(selectionAction);
      return;
    }
    if (shortcut === 'ask' && onAskSelection) {
      onAskSelection(selectionAction, 'keyboard');
      return;
    }
    onOpenComposer(selectionAction);
  });

  useEventListener(
    onOpenReaderChat && onCloseReaderChat && !selectionAction && !composer ? window : null,
    'keydown',
    (event) => {
      if (!readerChatShortcut(event)) return;

      event.preventDefault();
      event.stopPropagation();
      if (readerChatOpen) {
        onCloseReaderChat?.('keyboard');
        return;
      }
      onOpenReaderChat?.('keyboard');
    },
  );

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

      if (selectionAction && !target.closest('.reader-selection-menu,.reader-selection-handle')) {
        onClearSelection();
      }

      if (!activeId) return;
      if (target.closest(activeAnnotationPreserveSelector)) return;
      if (shouldPreserveActiveAnnotationOnPointerDown?.(event)) return;

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
      shouldPreserveActiveAnnotationOnPointerDown,
      selectionAction,
    ],
  );

  return {
    clearHiddenActiveAnnotation,
    handleReaderPointerDownCapture,
    toggleSettings,
  };
}

function readerChatShortcut(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key.toUpperCase() !== 'Q'
  ) {
    return false;
  }
  return !isEditableKeyboardTarget(event.target);
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input,textarea,select,[contenteditable="true"]'))
  );
}
