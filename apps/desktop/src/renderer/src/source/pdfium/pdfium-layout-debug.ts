export function pdfLayoutDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoPdfLayoutDebug?: boolean }).yomitomoPdfLayoutDebug === true ||
      window.localStorage.getItem('yomitomo:pdf-layout-debug') === '1'
    );
  } catch {
    return false;
  }
}

export function debugPdfLayout(event: string, details: Record<string, unknown>) {
  if (!pdfLayoutDebugEnabled()) return;
  console.info(`[yomitomo:pdf-layout] ${event}`, details);
}

export function debugRect(rect: DOMRect | undefined) {
  if (!rect) return null;
  return {
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
  };
}

export function debugComputedStyle(element: Element | null) {
  if (!element) return null;
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    height: style.height,
    left: style.left,
    minHeight: style.minHeight,
    opacity: style.opacity,
    overflow: style.overflow,
    position: style.position,
    top: style.top,
    transform: style.transform,
    visibility: style.visibility,
    zIndex: style.zIndex,
  };
}
