import type React from 'react';
import { alphaColor, defaultUserAnnotationColor } from '@yomitomo/shared';

const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
export const VIRTUAL_CURSOR_PATH = 'M10.1 10.1 L19.3 32 L22.1 22.1 L32 19.3 Z';

export function cursorSvgId(prefix: string, id: string) {
  return `${prefix}-${hashString(id).toString(36)}`;
}

export function cursorColorFromId(id: string) {
  const hue = Math.round(((hashString(id) % 997) * GOLDEN_RATIO_CONJUGATE * 360) % 360);
  return `hsl(${hue},70%,55%)`;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function noteStyle(color: string, active: boolean): React.CSSProperties {
  const accent = color || defaultUserAnnotationColor;
  return {
    borderColor: alphaColor(accent, active ? 0.78 : 0.42),
    boxShadow: active
      ? `0 0 0 3px ${alphaColor(accent, 0.16)}, 0 4px 24px rgba(40,35,29,.15), 0 8px 26px ${alphaColor(accent, 0.1)}`
      : `0 4px 24px rgba(40,35,29,.12), 0 8px 24px ${alphaColor(accent, 0.07)}`,
  };
}
