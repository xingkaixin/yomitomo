// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderSurfaceHandle } from '@yomitomo/reader-ui/reader-app-view';
import { useSourceReaderSurface } from './use-source-reader-surface';

describe('useSourceReaderSurface', () => {
  it('resolves semantic elements through the current reader handle', () => {
    const article = document.createElement('article');
    const canvas = document.createElement('div');
    const note = document.createElement('aside');
    const rail = document.createElement('aside');
    const root = document.createElement('div');
    const viewport = document.createElement('div');
    const requestSelectionCopy = vi.fn();
    const handle: ReaderSurfaceHandle = {
      getArticleElement: () => article,
      getCanvasElement: () => canvas,
      getNoteElement: () => note,
      getNoteElements: () => [note],
      getRailElement: () => rail,
      getRootElement: () => root,
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
    expect(result.current.getNoteElement('annotation-1')).toBe(note);
    expect(result.current.getNoteElements()).toEqual([note]);
    expect(result.current.railRef.current).toBe(rail);
    expect(result.current.rootRef.current).toBe(root);
    expect(result.current.viewportRef.current).toBe(viewport);
    result.current.requestSelectionCopy();
    expect(requestSelectionCopy).toHaveBeenCalledOnce();
  });
});
