import { useEffect, useRef, useState, type RefObject } from 'react';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import { ebookSpreadAvailableWidth, ebookSpreadLayout } from './app-source-bookcase-ebook-utils';

export function useEbookSpreadLayout({
  articleId,
  canvasRef,
  contentWidth,
  surfaceRef,
}: {
  articleId: string;
  canvasRef: RefObject<HTMLElement | null>;
  contentWidth: number;
  surfaceRef: RefObject<HTMLElement | null>;
}) {
  const [layout, setLayout] = useState(() => ebookSpreadLayout({ canvasWidth: 0, contentWidth }));
  const traceRef = useRef('');

  useEffect(() => {
    const layoutElement = surfaceRef.current ?? canvasRef.current;
    if (!layoutElement) return;
    const update = () => {
      const rect = layoutElement.getBoundingClientRect();
      if (rect.width <= 0) return;
      const style = window.getComputedStyle(layoutElement);
      const layoutWidth = ebookSpreadAvailableWidth({
        layoutWidth: rect.width,
        paddingLeft: cssPixelValue(style.paddingLeft),
        paddingRight: cssPixelValue(style.paddingRight),
      });
      const nextLayout = ebookSpreadLayout({ canvasWidth: layoutWidth, contentWidth });
      const traceKey = [
        contentWidth,
        nextLayout.columns,
        nextLayout.railLayout.mode,
        nextLayout.railLayout.articleWidth,
      ].join(':');
      if (traceRef.current !== traceKey) {
        traceRef.current = traceKey;
        recordRendererPerformanceTiming('ebook_spread_layout', {
          articleId,
          columns: nextLayout.columns,
          contentWidth,
          layoutSource: layoutElement === surfaceRef.current ? 'surface' : 'canvas',
          layoutWidth: Math.round(layoutWidth),
          measuredWidth: Math.round(rect.width),
          railLayout: nextLayout.railLayout,
        });
      }
      setLayout(nextLayout);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(layoutElement);
    return () => observer.disconnect();
  }, [articleId, canvasRef, contentWidth, surfaceRef]);

  return layout;
}

function cssPixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
