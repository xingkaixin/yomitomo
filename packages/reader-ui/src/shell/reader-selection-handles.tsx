import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type {
  ReaderUiLabels,
  SelectionAdjustmentHandle,
  SelectionAdjustmentPointer,
} from './reader-app-view-types';

export type SelectionHandlePosition = {
  left: number;
  top: number;
  height: number;
};

export type SelectionHandlePositions = Record<SelectionAdjustmentHandle, SelectionHandlePosition>;

type SelectionHandleStyle = React.CSSProperties & {
  '--reader-selection-handle-height': string;
};

export type SelectionHandlesProps = {
  boxes: HighlightBox[];
  draggingHandle?: SelectionAdjustmentHandle;
  labels: ReaderUiLabels;
  onDrag: (point: SelectionAdjustmentPointer) => void;
  onDragEnd: (point: SelectionAdjustmentPointer) => void;
  onDragStart: (point: SelectionAdjustmentPointer) => void;
};

export function selectionHandlePositionsFromBoxes(
  boxes: HighlightBox[],
): SelectionHandlePositions | null {
  const visibleBoxes = boxes.filter((box) => box.width >= 2 && box.height >= 2);
  const first = visibleBoxes[0];
  const last = visibleBoxes.at(-1);
  if (!first || !last) return null;

  return {
    start: { left: first.left, top: first.top, height: first.height },
    end: { left: last.left + last.width, top: last.top, height: last.height },
  };
}

export function SelectionHandles({
  boxes,
  draggingHandle,
  labels,
  onDrag,
  onDragEnd,
  onDragStart,
}: SelectionHandlesProps) {
  const positions = React.useMemo(() => selectionHandlePositionsFromBoxes(boxes), [boxes]);
  const activeHandleRef = React.useRef<SelectionAdjustmentHandle | null>(null);

  if (!positions) return null;

  const renderHandle = (handle: SelectionAdjustmentHandle) => {
    const position = selectionHandlePositionForRenderedHandle(
      positions,
      handle,
      activeHandleRef.current,
      draggingHandle,
    );
    const style: SelectionHandleStyle = {
      left: position.left,
      top: position.top,
      '--reader-selection-handle-height': `${position.height}px`,
    };

    return (
      <button
        aria-label={handle === 'start' ? labels.adjustSelectionStart : labels.adjustSelectionEnd}
        className={`reader-selection-handle is-${handle}`}
        data-reader-selection-handle={handle}
        draggable={false}
        key={handle}
        style={style}
        type="button"
        onClick={stopPointerAction}
        onMouseUp={stopPointerAction}
        onPointerCancel={(event) => {
          if (activeHandleRef.current !== handle) return;
          event.preventDefault();
          event.stopPropagation();
          activeHandleRef.current = null;
          onDragEnd(pointerPayload(handle, event));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType !== 'touch') return;
          event.preventDefault();
          event.stopPropagation();
          activeHandleRef.current = handle;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          onDragStart(pointerPayload(handle, event));
        }}
        onPointerMove={(event) => {
          if (activeHandleRef.current !== handle) return;
          event.preventDefault();
          event.stopPropagation();
          onDrag(pointerPayload(handle, event));
        }}
        onPointerUp={(event) => {
          if (activeHandleRef.current !== handle) return;
          event.preventDefault();
          event.stopPropagation();
          activeHandleRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const point = pointerPayload(handle, event);
          onDrag(point);
          onDragEnd(point);
        }}
      />
    );
  };

  return (
    <>
      {renderHandle('start')}
      {renderHandle('end')}
    </>
  );
}

function selectionHandlePositionForRenderedHandle(
  positions: SelectionHandlePositions,
  handle: SelectionAdjustmentHandle,
  activeHandle: SelectionAdjustmentHandle | null,
  draggingHandle: SelectionAdjustmentHandle | undefined,
) {
  if (!activeHandle || !draggingHandle || activeHandle === draggingHandle) {
    return positions[handle];
  }
  if (handle === activeHandle) return positions[draggingHandle];
  if (handle === draggingHandle) return positions[activeHandle];
  return positions[handle];
}

function pointerPayload(
  handle: SelectionAdjustmentHandle,
  event: React.PointerEvent<HTMLElement>,
): SelectionAdjustmentPointer {
  return { handle, clientX: event.clientX, clientY: event.clientY };
}

function stopPointerAction(event: React.SyntheticEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}
