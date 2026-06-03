import { useMemo, type CSSProperties } from 'react';

export type DialogSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SourceAwareDialogStyle = CSSProperties & {
  '--dialog-source-origin-x': string;
  '--dialog-source-origin-y': string;
  '--dialog-source-shift-x': string;
  '--dialog-source-shift-y': string;
};

export function useSourceAwareDialogTransition(sourceRect: DialogSourceRect | null | undefined) {
  return useMemo(() => sourceAwareDialogStyle(sourceRect), [sourceRect]);
}

export function elementDialogSourceRect(element: Element): DialogSourceRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function sourceAwareDialogStyle(
  sourceRect: DialogSourceRect | null | undefined,
): SourceAwareDialogStyle {
  if (!sourceRect || !isValidDialogSourceRect(sourceRect)) {
    return {
      '--dialog-source-origin-x': '50%',
      '--dialog-source-origin-y': '50%',
      '--dialog-source-shift-x': '0px',
      '--dialog-source-shift-y': '0px',
    };
  }

  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;

  return {
    '--dialog-source-origin-x': `${(clamp(sourceCenterX, 0, viewportWidth) / viewportWidth) * 100}%`,
    '--dialog-source-origin-y': `${(clamp(sourceCenterY, 0, viewportHeight) / viewportHeight) * 100}%`,
    '--dialog-source-shift-x': `${clamp((sourceCenterX - viewportWidth / 2) * 0.08, -42, 42)}px`,
    '--dialog-source-shift-y': `${clamp((sourceCenterY - viewportHeight / 2) * 0.08, -42, 42)}px`,
  };
}

function isValidDialogSourceRect(rect: DialogSourceRect) {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
