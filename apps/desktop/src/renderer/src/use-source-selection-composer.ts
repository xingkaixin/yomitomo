import { useCallback, useState, type RefObject } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { HighlightChoice } from '@yomitomo/reader-ui';
import type { SourceSelectionAction } from './app-source-bookcase-shared';

type UseSourceSelectionComposerInput = {
  canvasRef: RefObject<HTMLElement | null>;
  onOpenComposer?: () => void;
};

export function useSourceSelectionComposer({
  canvasRef,
  onOpenComposer,
}: UseSourceSelectionComposerInput) {
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
  const [selectionAction, setSelectionAction] = useState<SourceSelectionAction | null>(null);
  const [composer, setComposer] = useState<SourceSelectionAction | null>(null);

  const clearSelection = useCallback(() => {
    setSelectionAction((action) => (action ? null : action));
    setTemporaryBoxes((boxes) => (boxes.length > 0 ? [] : boxes));
  }, []);

  const clearAnnotationUiState = useCallback(() => {
    setHighlightChoice((choice) => (choice ? null : choice));
    setSelectionAction((action) => (action ? null : action));
    setComposer((draft) => (draft ? null : draft));
    setTemporaryBoxes((boxes) => (boxes.length > 0 ? [] : boxes));
  }, []);

  const openSelectionAction = useCallback(
    (action: SourceSelectionAction, boxes: HighlightBox[]) => {
      setSelectionAction(action);
      setComposer(null);
      setTemporaryBoxes(boxes);
    },
    [],
  );

  const cancelComposer = useCallback(() => {
    setComposer((draft) => (draft ? null : draft));
    setSelectionAction((action) => (action ? null : action));
    setTemporaryBoxes((boxes) => (boxes.length > 0 ? [] : boxes));
  }, []);

  const copySelection = useCallback(
    async (action: SourceSelectionAction) => {
      await navigator.clipboard.writeText(action.anchor.exact);
      clearSelection();
    },
    [clearSelection],
  );

  const openComposer = useCallback(
    (action: SourceSelectionAction) => {
      const canvasWidth = canvasRef.current?.clientWidth || 360;
      onOpenComposer?.();
      setComposer({
        x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
        y: action.y,
        anchor: action.anchor,
      });
      setSelectionAction(null);
    },
    [canvasRef, onOpenComposer],
  );

  return {
    temporaryBoxes,
    setTemporaryBoxes,
    highlightChoice,
    setHighlightChoice,
    selectionAction,
    setSelectionAction,
    composer,
    setComposer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    openComposer,
  };
}
