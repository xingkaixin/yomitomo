import type { RefObject } from 'react';
import {
  buildSearchClearGlowBackground,
  textForSearchClearMirror,
  useSearchClearDissolveCore,
  type SearchClearGlowBuilderParams,
} from '@yomitomo/reader-ui/reader-search-clear-dissolve-core';

export function textForLibrarySearchMirror(value: string) {
  return textForSearchClearMirror(value);
}

export function useLibrarySearchClearDissolve({
  inputRef,
  onQueryChange,
  query,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  return useSearchClearDissolveCore({
    inputRef,
    query,
    onQueryChange,
    buildGlow: buildLibrarySearchClearGlow,
    formatMirrorText: textForLibrarySearchMirror,
    onClearStart: markLibraryClearTone,
    onClearStyles: clearLibraryClearTone,
  });
}

function buildLibrarySearchClearGlow({ canvas, input, text, wrap }: SearchClearGlowBuilderParams) {
  const isDark = isDarkClearSurface(wrap);
  return buildSearchClearGlowBackground({
    canvas,
    color: isDark ? '255,255,255' : '0,0,0',
    input,
    text,
    wrap,
  });
}

function markLibraryClearTone(wrap: HTMLDivElement) {
  wrap.dataset.clearTone = isDarkClearSurface(wrap) ? 'dark' : 'light';
}

function clearLibraryClearTone(wrap: HTMLDivElement | null) {
  wrap?.removeAttribute('data-clear-tone');
}

function isDarkClearSurface(wrap: HTMLElement) {
  return wrap.ownerDocument.documentElement.dataset.themeTone === 'dark';
}
