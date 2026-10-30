import { useCallback, useReducer, type RefObject, type SetStateAction } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { HighlightChoice, SelectionAction } from '@yomitomo/reader-ui/reader-app-view';

type UseSourceSelectionComposerInput = {
  canvasRef: RefObject<HTMLElement | null>;
  onRequestSelectionCopy: () => void;
  onOpenComposer?: () => void;
};

type SelectionComposerState = {
  composer: SelectionAction | null;
  highlightChoice: HighlightChoice | null;
  selectionAction: SelectionAction | null;
  temporaryBoxes: HighlightBox[];
};

type SelectionComposerEvent =
  | { type: 'annotationUiCleared' }
  | { type: 'composerCancelled' }
  | { type: 'composerChanged'; update: SetStateAction<SelectionAction | null> }
  | { type: 'composerOpened'; composer: SelectionAction }
  | { type: 'highlightChoiceChanged'; update: SetStateAction<HighlightChoice | null> }
  | { type: 'selectionActionChanged'; update: SetStateAction<SelectionAction | null> }
  | { type: 'selectionActionOpened'; action: SelectionAction; boxes: HighlightBox[] }
  | { type: 'selectionCleared' }
  | { type: 'temporaryBoxesChanged'; update: SetStateAction<HighlightBox[]> };

const initialSelectionComposerState: SelectionComposerState = {
  composer: null,
  highlightChoice: null,
  selectionAction: null,
  temporaryBoxes: [],
};

function selectionComposerReducer(
  state: SelectionComposerState,
  event: SelectionComposerEvent,
): SelectionComposerState {
  switch (event.type) {
    case 'annotationUiCleared':
      return keepUnchanged(state, {
        composer: null,
        highlightChoice: null,
        selectionAction: null,
        temporaryBoxes: clearedBoxes(state.temporaryBoxes),
      });
    case 'composerCancelled':
      return keepUnchanged(state, {
        ...state,
        composer: null,
        selectionAction: null,
        temporaryBoxes: clearedBoxes(state.temporaryBoxes),
      });
    case 'composerChanged':
      return keepUnchanged(state, {
        ...state,
        composer: resolveUpdate(event.update, state.composer),
      });
    case 'composerOpened':
      return { ...state, composer: event.composer, selectionAction: null };
    case 'highlightChoiceChanged':
      return keepUnchanged(state, {
        ...state,
        highlightChoice: resolveUpdate(event.update, state.highlightChoice),
      });
    case 'selectionActionChanged':
      return keepUnchanged(state, {
        ...state,
        selectionAction: resolveUpdate(event.update, state.selectionAction),
      });
    case 'selectionActionOpened':
      return {
        ...state,
        composer: null,
        selectionAction: event.action,
        temporaryBoxes: event.boxes,
      };
    case 'selectionCleared':
      return keepUnchanged(state, {
        ...state,
        selectionAction: null,
        temporaryBoxes: clearedBoxes(state.temporaryBoxes),
      });
    case 'temporaryBoxesChanged':
      return keepUnchanged(state, {
        ...state,
        temporaryBoxes: resolveUpdate(event.update, state.temporaryBoxes),
      });
  }
}

function resolveUpdate<T>(update: SetStateAction<T>, current: T): T {
  return typeof update === 'function' ? (update as (current: T) => T)(current) : update;
}

function clearedBoxes(boxes: HighlightBox[]) {
  return boxes.length > 0 ? [] : boxes;
}

function keepUnchanged(state: SelectionComposerState, next: SelectionComposerState) {
  return next.composer === state.composer &&
    next.highlightChoice === state.highlightChoice &&
    next.selectionAction === state.selectionAction &&
    next.temporaryBoxes === state.temporaryBoxes
    ? state
    : next;
}

export function useSourceSelectionComposer({
  canvasRef,
  onRequestSelectionCopy,
  onOpenComposer,
}: UseSourceSelectionComposerInput) {
  const [{ composer, highlightChoice, selectionAction, temporaryBoxes }, dispatch] = useReducer(
    selectionComposerReducer,
    initialSelectionComposerState,
  );

  const setTemporaryBoxes = useCallback(
    (update: SetStateAction<HighlightBox[]>) => dispatch({ type: 'temporaryBoxesChanged', update }),
    [],
  );
  const setHighlightChoice = useCallback(
    (update: SetStateAction<HighlightChoice | null>) =>
      dispatch({ type: 'highlightChoiceChanged', update }),
    [],
  );
  const setSelectionAction = useCallback(
    (update: SetStateAction<SelectionAction | null>) =>
      dispatch({ type: 'selectionActionChanged', update }),
    [],
  );
  const setComposer = useCallback(
    (update: SetStateAction<SelectionAction | null>) =>
      dispatch({ type: 'composerChanged', update }),
    [],
  );
  const clearSelection = useCallback(() => dispatch({ type: 'selectionCleared' }), []);
  const clearAnnotationUiState = useCallback(() => dispatch({ type: 'annotationUiCleared' }), []);
  const openSelectionAction = useCallback(
    (action: SelectionAction, boxes: HighlightBox[]) =>
      dispatch({ type: 'selectionActionOpened', action, boxes }),
    [],
  );
  const cancelComposer = useCallback(() => dispatch({ type: 'composerCancelled' }), []);

  const copySelection = useCallback(async (action: SelectionAction) => {
    await navigator.clipboard.writeText(action.anchor.exact);
  }, []);

  const openComposer = useCallback(
    (action: SelectionAction) => {
      const canvasWidth = canvasRef.current?.clientWidth || 360;
      onOpenComposer?.();
      dispatch({
        type: 'composerOpened',
        composer: {
          x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
          y: action.y,
          anchor: action.anchor,
        },
      });
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
    requestSelectionCopy: onRequestSelectionCopy,
    openComposer,
  };
}
