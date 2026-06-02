import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { WindowAnimationSourceRect } from '../../ipc-contract';

type SourceAwareWindowStyle = CSSProperties & {
  '--annotation-window-origin-x': string;
  '--annotation-window-origin-y': string;
  '--annotation-window-shift-x': string;
  '--annotation-window-shift-y': string;
};

export function useSourceAwareWindowTransition(params: URLSearchParams) {
  const source = useMemo(() => readWindowAnimationSource(params), [params]);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    return window.yomitomoDesktop.onAnnotationWindowClosing?.(() => setClosing(true));
  }, []);

  return {
    className: closing ? 'is-source-closing' : '',
    style: sourceAwareWindowStyle(source),
  };
}

export function elementWindowSourceRect(element: Element): WindowAnimationSourceRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function readWindowAnimationSource(params: URLSearchParams) {
  const x = Number(params.get('animationSourceX'));
  const y = Number(params.get('animationSourceY'));
  const width = Number(params.get('animationSourceWidth'));
  const height = Number(params.get('animationSourceHeight'));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function sourceAwareWindowStyle(
  source: Pick<WindowAnimationSourceRect, 'x' | 'y' | 'width' | 'height'> | null,
): SourceAwareWindowStyle {
  if (!source) {
    return {
      '--annotation-window-origin-x': '50%',
      '--annotation-window-origin-y': '50%',
      '--annotation-window-shift-x': '0px',
      '--annotation-window-shift-y': '0px',
    };
  }

  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const originX = clamp(sourceCenterX, 0, viewportWidth);
  const originY = clamp(sourceCenterY, 0, viewportHeight);

  return {
    '--annotation-window-origin-x': `${(originX / viewportWidth) * 100}%`,
    '--annotation-window-origin-y': `${(originY / viewportHeight) * 100}%`,
    '--annotation-window-shift-x': `${clamp((sourceCenterX - viewportWidth / 2) * 0.08, -42, 42)}px`,
    '--annotation-window-shift-y': `${clamp((sourceCenterY - viewportHeight / 2) * 0.08, -42, 42)}px`,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
