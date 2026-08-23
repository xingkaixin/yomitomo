// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderSurfaceHandle } from '@yomitomo/reader-ui/reader-app-view';
import { useSourceReaderSurface } from './use-source-reader-surface';

describe('useSourceReaderSurface', () => {
  it('resolves semantic elements through the current reader handle', () => {
    const article = document.createElement('article');
    const canvas = document.createElement('div');
    const rail = document.createElement('aside');
    const viewport = document.createElement('div');
    const requestSelectionCopy = vi.fn();
    const handle: ReaderSurfaceHandle = {
      getArticleElement: () => article,
      getCanvasElement: () => canvas,
      getRailElement: () => rail,
      getViewportElement: () => viewport,
      requestSelectionCopy,
    };
    const { result } = renderHook(() => useSourceReaderSurface());

    expect(result.current.articleRef.current).toBeNull();

    act(() => {
      result.current.handleRef.current = handle;
    });

    expect(result.current.articleRef.current).toBe(article);
    expect(result.current.canvasRef.current).toBe(canvas);
    expect(result.current.railRef.current).toBe(rail);
    expect(result.current.viewportRef.current).toBe(viewport);
    result.current.requestSelectionCopy();
    expect(requestSelectionCopy).toHaveBeenCalledOnce();
  });
});
