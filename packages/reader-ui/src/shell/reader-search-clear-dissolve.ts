import type { RefObject } from 'react';
import {
  buildSearchClearGlowBackground,
  textForSearchClearMirror,
  useSearchClearDissolveCore,
  type SearchClearGlowBuilderParams,
} from './reader-search-clear-dissolve-core';

export function textForSearchMirror(value: string) {
  return textForSearchClearMirror(value);
}

export function useSearchClearDissolve({
  inputRef,
  query,
  onQueryChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return useSearchClearDissolveCore({
    inputRef,
    query,
    onQueryChange,
    buildGlow: buildSearchClearGlow,
  });
}

function buildSearchClearGlow({ canvas, input, text, wrap }: SearchClearGlowBuilderParams) {
  const isDark = Boolean(wrap.closest('.reader-app.is-reader-background-dark'));
  return buildSearchClearGlowBackground({
    canvas,
    color: isDark ? '255,255,255' : '0,0,0',
    input,
    text,
    wrap,
  });
}
