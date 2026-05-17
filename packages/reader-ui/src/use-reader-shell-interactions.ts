import React from 'react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import type { HighlightChoice, PendingComposer, SelectionAction } from './reader-app-view-types';
import { selectionActionShortcut } from './reader-utils';

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
  agentAnnotateOpen: boolean;
  composer: PendingComposer | null;
  filteredAnnotationCount: number;
  highlightChoice: HighlightChoice | null;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  settingsOpen: boolean;
  visibleAnnotationIds: Set<string>;
  onCancelComposer: () => void;
  onClearActiveAnnotation: () => void;
  onCloseFloatingPanels: () => void;
  onCloseHighlightChoice: () => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onOpenComposer: (action: SelectionAction) => void;
  onToggleAgentAnnotate: () => void;
  onToggleSettings: () => void;
};

export type ReaderShellInteractions = {
  annotationFilterOpen: boolean;
  handleReaderPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void;
  toggleAgentAnnotate: () => void;
  toggleAnnotationFilter: () => void;
  toggleSettings: () => void;
};

export function useReaderShellInteractions({
  activeId,
  agentAnnotateOpen,
  composer,
  filteredAnnotationCount,
  highlightChoice,
  selectionAction,
  selectionActionShortcuts,
  settingsOpen,
  visibleAnnotationIds,
  onCancelComposer,
  onClearActiveAnnotation,
  onCloseFloatingPanels,
  onCloseHighlightChoice,
  onCopySelection,
  onOpenComposer,
  onToggleAgentAnnotate,
  onToggleSettings,
}: UseReaderShellInteractionsOptions): ReaderShellInteractions {
  const [annotationFilterOpen, setAnnotationFilterOpen] = React.useState(false);

  React.useEffect(() => {
    if (filteredAnnotationCount === 0) setAnnotationFilterOpen(false);
  }, [filteredAnnotationCount]);

  React.useEffect(() => {
    if (!activeId || visibleAnnotationIds.has(activeId)) return;
    onCloseHighlightChoice();
    onClearActiveAnnotation();
  }, [activeId, onClearActiveAnnotation, onCloseHighlightChoice, visibleAnnotationIds]);

  React.useEffect(() => {
    if (!annotationFilterOpen) return;

    function handleFilterPanelKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      event.preventDefault();
      setAnnotationFilterOpen(false);
    }

    window.addEventListener('keydown', handleFilterPanelKeyDown);
    return () => window.removeEventListener('keydown', handleFilterPanelKeyDown);
  }, [annotationFilterOpen]);

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
        void onCopySelection(activeSelectionAction);
        return;
      }
      onOpenComposer(activeSelectionAction);
    }

    window.addEventListener('keydown', handleSelectionShortcut);
    return () => window.removeEventListener('keydown', handleSelectionShortcut);
  }, [composer, onCopySelection, onOpenComposer, selectionAction, selectionActionShortcuts]);

  const toggleAnnotationFilter = React.useCallback(() => {
    onCloseFloatingPanels();
    setAnnotationFilterOpen((open) => !open);
  }, [onCloseFloatingPanels]);

  const toggleAgentAnnotate = React.useCallback(() => {
    setAnnotationFilterOpen(false);
    onToggleAgentAnnotate();
  }, [onToggleAgentAnnotate]);

  const toggleSettings = React.useCallback(() => {
    setAnnotationFilterOpen(false);
    onToggleSettings();
  }, [onToggleSettings]);

  const handleReaderPointerDownCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;

      if (settingsOpen || agentAnnotateOpen || annotationFilterOpen) {
        if (!target.closest('[data-reader-floating-panel],[data-reader-popover-anchor]')) {
          setAnnotationFilterOpen(false);
          onCloseFloatingPanels();
        }
      }

      if (composer && !target.closest('.reader-composer')) {
        onCancelComposer();
      }

      if (highlightChoice && !target.closest('.reader-highlight-choice-menu,.reader-highlight')) {
        onCloseHighlightChoice();
      }

      if (!activeId) return;
      if (target.closest(activeAnnotationPreserveSelector)) return;

      onCloseHighlightChoice();
      onClearActiveAnnotation();
    },
    [
      activeId,
      agentAnnotateOpen,
      annotationFilterOpen,
      composer,
      highlightChoice,
      onCancelComposer,
      onClearActiveAnnotation,
      onCloseFloatingPanels,
      onCloseHighlightChoice,
      settingsOpen,
    ],
  );

  return {
    annotationFilterOpen,
    handleReaderPointerDownCapture,
    toggleAgentAnnotate,
    toggleAnnotationFilter,
    toggleSettings,
  };
}
