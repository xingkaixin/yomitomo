import {
  createElement,
  useCallback,
  useEffectEvent,
  useReducer,
  useRef,
  type RefObject,
} from 'react';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import { ebookSpreadAvailableWidth, ebookSpreadLayout } from './app-source-bookcase-ebook-utils';

type EbookSpreadLayout = ReturnType<typeof ebookSpreadLayout>;

function ebookSpreadLayoutReducer(
  _state: EbookSpreadLayout,
  event: { type: 'layoutMeasured'; layout: EbookSpreadLayout },
) {
  return event.layout;
}

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
  const [layout, dispatch] = useReducer(ebookSpreadLayoutReducer, contentWidth, (width) =>
    ebookSpreadLayout({ canvasWidth: 0, contentWidth: width }),
  );
  const traceRef = useRef('');
  const readInput = useEffectEvent(() => ({ articleId, contentWidth }));

  const observeLayout = useCallback(
    (marker: HTMLElement | null) => {
      const layoutElement = surfaceRef.current ?? canvasRef.current;
      if (!marker || !layoutElement) return;
      const update = () => {
        const { articleId: currentArticleId, contentWidth: currentContentWidth } = readInput();
        const rect = layoutElement.getBoundingClientRect();
        if (rect.width <= 0) return;
        const style = window.getComputedStyle(layoutElement);
        const layoutWidth = ebookSpreadAvailableWidth({
          layoutWidth: rect.width,
          paddingLeft: cssPixelValue(style.paddingLeft),
          paddingRight: cssPixelValue(style.paddingRight),
        });
        const nextLayout = ebookSpreadLayout({
          canvasWidth: layoutWidth,
          contentWidth: currentContentWidth,
        });
        const traceKey = [
          currentContentWidth,
          nextLayout.columns,
          nextLayout.railLayout.mode,
          nextLayout.railLayout.articleWidth,
        ].join(':');
        if (traceRef.current !== traceKey) {
          traceRef.current = traceKey;
          recordRendererPerformanceTiming('ebook_spread_layout', {
            articleId: currentArticleId,
            columns: nextLayout.columns,
            contentWidth: currentContentWidth,
            layoutSource: layoutElement === surfaceRef.current ? 'surface' : 'canvas',
            layoutWidth: Math.round(layoutWidth),
            measuredWidth: Math.round(rect.width),
            railLayout: nextLayout.railLayout,
          });
        }
        dispatch({ type: 'layoutMeasured', layout: nextLayout });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(layoutElement);
      return () => observer.disconnect();
    },
    [canvasRef, surfaceRef],
  );

  return {
    ...layout,
    marker: createElement('span', { hidden: true, key: contentWidth, ref: observeLayout }),
  };
}

function cssPixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
