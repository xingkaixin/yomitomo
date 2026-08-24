export function ebookLayoutDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoEbookLayoutDebug?: boolean }).yomitomoEbookLayoutDebug ===
        true || window.localStorage.getItem('yomitomo:ebook-layout-debug') === '1'
    );
  } catch {
    return false;
  }
}

export function debugEbookLayout(event: string, details: Record<string, unknown>) {
  if (!ebookLayoutDebugEnabled()) return;
  console.info(`[yomitomo:ebook-layout] ${event}`, details);
}

export function debugEbookRect(rect: DOMRect | null | undefined) {
  if (!rect) return null;
  return {
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
  };
}
