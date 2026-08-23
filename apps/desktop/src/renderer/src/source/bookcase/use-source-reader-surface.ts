import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type { ReaderSurfaceHandle } from '@yomitomo/reader-ui/reader-app-view';

function elementRef<T extends Element>(
  handleRef: RefObject<ReaderSurfaceHandle | null>,
  getElement: (handle: ReaderSurfaceHandle) => T | null,
): RefObject<T | null> {
  return {
    get current() {
      const handle = handleRef.current;
      return handle ? getElement(handle) : null;
    },
  };
}

export function useSourceReaderSurface() {
  const handleRef = useRef<ReaderSurfaceHandle>(null);
  const elementRefs = useMemo(
    () => ({
      articleRef: elementRef(handleRef, (handle) => handle.getArticleElement()),
      canvasRef: elementRef(handleRef, (handle) => handle.getCanvasElement()),
      railRef: elementRef(handleRef, (handle) => handle.getRailElement()),
      viewportRef: elementRef(handleRef, (handle) => handle.getViewportElement()),
    }),
    [],
  );
  const requestSelectionCopy = useCallback(() => handleRef.current?.requestSelectionCopy(), []);

  return {
    ...elementRefs,
    handleRef,
    requestSelectionCopy,
  };
}
