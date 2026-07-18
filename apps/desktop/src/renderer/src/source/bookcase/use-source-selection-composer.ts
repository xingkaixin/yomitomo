import { useCallback, useState, type RefObject } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { HighlightChoice, SelectionAction } from '@yomitomo/reader-ui/reader-app-view';

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
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [copyRequestKey, setCopyRequestKey] = useState(0);
  const [composer, setComposer] = useState<SelectionAction | null>(null);

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

  const openSelectionAction = useCallback((action: SelectionAction, boxes: HighlightBox[]) => {
    setSelectionAction(action);
    setComposer(null);
    setTemporaryBoxes(boxes);
  }, []);

  const cancelComposer = useCallback(() => {
    setComposer((draft) => (draft ? null : draft));
    setSelectionAction((action) => (action ? null : action));
    setTemporaryBoxes((boxes) => (boxes.length > 0 ? [] : boxes));
  }, []);

  const copySelection = useCallback(async (action: SelectionAction) => {
    await navigator.clipboard.writeText(action.anchor.exact);
  }, []);

  const requestSelectionCopy = useCallback(() => {
    setCopyRequestKey((key) => key + 1);
  }, []);

  const openComposer = useCallback(
    (action: SelectionAction) => {
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
    copyRequestKey,
    setSelectionAction,
    composer,
    setComposer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    requestSelectionCopy,
    openComposer,
  };
}
