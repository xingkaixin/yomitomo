import type React from 'react';
import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import type { useDocumentState } from '@embedpdf/core/react';
import type { PdfEngine } from '@embedpdf/models';
import type { ArticleTranslation, PdfRect } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import {
  useSourceBilingualTranslation,
  type TranslationSurfaceAdapter,
} from '../bookcase/use-source-bilingual-translation';
import {
  pdfPageTranslationBlocks,
  pdfPageTranslationSourceId,
  pdfTranslationBlockBounds,
  type PdfTranslationBlock,
} from './pdfium-translation-blocks';

type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

export type PdfPageTranslationLayout = {
  blocks: PdfTranslationBlock[];
  boundsByBlockId: ReadonlyMap<string, PdfRect>;
};

type PdfTranslationOverlayState = {
  layoutsByPage: ReadonlyMap<number, PdfPageTranslationLayout>;
  translationsByPage: ReadonlyMap<number, ArticleTranslation>;
};

type PdfTranslationOverlayEvent =
  | { type: 'pageLayoutLoaded'; pageIndex: number; layout: PdfPageTranslationLayout }
  | { type: 'pageTranslationStored'; pageIndex: number; translation: ArticleTranslation }
  | { type: 'pageTranslationDeleted'; pageIndex: number };

const initialOverlayState: PdfTranslationOverlayState = {
  layoutsByPage: new Map(),
  translationsByPage: new Map(),
};

function overlayStateReducer(
  state: PdfTranslationOverlayState,
  event: PdfTranslationOverlayEvent,
): PdfTranslationOverlayState {
  switch (event.type) {
    case 'pageLayoutLoaded': {
      const next = new Map(state.layoutsByPage);
      next.set(event.pageIndex, event.layout);
      return { ...state, layoutsByPage: next };
    }
    case 'pageTranslationStored': {
      const next = new Map(state.translationsByPage);
      next.set(event.pageIndex, event.translation);
      return { ...state, translationsByPage: next };
    }
    case 'pageTranslationDeleted': {
      if (!state.translationsByPage.has(event.pageIndex)) return state;
      const next = new Map(state.translationsByPage);
      next.delete(event.pageIndex);
      return { ...state, translationsByPage: next };
    }
  }
}

export function usePdfiumBilingualTranslation({
  articleId,
  currentPageIndex,
  document,
  engine,
  extractPageText,
  jumpToPage,
  targetLanguage,
}: {
  articleId: string;
  currentPageIndex: number;
  document: PdfiumLoadedDocument | undefined;
  engine: PdfEngine;
  extractPageText: (pageIndex: number) => Promise<string>;
  jumpToPage: (pageNumber: number) => void;
  targetLanguage?: string;
}) {
  const [overlayState, dispatchOverlay] = useReducer(overlayStateReducer, initialOverlayState);
  const pendingLayouts = useRef(new Map<number, Promise<PdfPageTranslationLayout>>());

  const ensurePageLayout = useStableCallback(async (pageIndex: number) => {
    const stored =
      overlayState.layoutsByPage.get(pageIndex) ?? pendingLayouts.current.get(pageIndex);
    if (stored) return stored;
    const pdfPage = document?.pages[pageIndex];
    if (!document || !pdfPage) return;
    const pending = Promise.all([
      extractPageText(pageIndex),
      engine.getPageGeometry(document, pdfPage).toPromise(),
    ])
      .then(([pageText, geometry]) => {
        const blocks = pdfPageTranslationBlocks(pageIndex, pageText, 0, geometry);
        const boundsByBlockId = new Map<string, PdfRect>();
        for (const block of blocks) {
          const bounds = pdfTranslationBlockBounds(
            geometry,
            block,
            pdfPage.size.width,
            pdfPage.size.height,
          );
          if (bounds) boundsByBlockId.set(block.id, bounds);
        }
        const layout = { blocks, boundsByBlockId };
        dispatchOverlay({ type: 'pageLayoutLoaded', pageIndex, layout });
        return layout;
      })
      .finally(() => pendingLayouts.current.delete(pageIndex));
    pendingLayouts.current.set(pageIndex, pending);
    return pending;
  });

  const surface = useMemo<TranslationSurfaceAdapter<{
    pageIndex: number;
    translation: ArticleTranslation | null;
    visible: boolean;
  }> | null>(() => {
    if (!document) return null;
    const sourceId = pdfPageTranslationSourceId(currentPageIndex);
    return {
      sourceId,
      applyTranslation: (translation, visible) => ({
        pageIndex: currentPageIndex,
        translation,
        visible,
      }),
      extractBlocks: async () => {
        const layout = await ensurePageLayout(currentPageIndex);
        return (layout?.blocks ?? []).map(({ id, text }) => ({ id, text }));
      },
      scrollToBlock: (blockId) => {
        const match = /^pdf-p(\d+)-/.exec(blockId);
        if (match) jumpToPage(Number(match[1]) + 1);
      },
    };
  }, [currentPageIndex, document, ensurePageLayout, jumpToPage]);

  const handleTranslationReceived = useCallback(
    (translation: ArticleTranslation) => {
      const pageIndex = pdfPageIndexFromSourceId(translation.sourceId);
      if (pageIndex === null) return;
      dispatchOverlay({ type: 'pageTranslationStored', pageIndex, translation });
      void ensurePageLayout(pageIndex).catch(() => undefined);
    },
    [ensurePageLayout],
  );

  const handleTranslationDeleted = useCallback((sourceId: string | undefined) => {
    const pageIndex = pdfPageIndexFromSourceId(sourceId);
    if (pageIndex === null) return;
    dispatchOverlay({ type: 'pageTranslationDeleted', pageIndex });
  }, []);

  const session = useSourceBilingualTranslation({
    articleId,
    contentKind: 'pdfPage',
    onTranslationDeleted: handleTranslationDeleted,
    onTranslationReceived: handleTranslationReceived,
    surface,
    targetLanguage,
  });

  const pageTranslationFor = useCallback(
    (pageIndex: number) => {
      if (!session.visible) return null;
      if (pageIndex === currentPageIndex) {
        return session.translation;
      }
      return overlayState.translationsByPage.get(pageIndex) ?? null;
    },
    [currentPageIndex, overlayState.translationsByPage, session.translation, session.visible],
  );

  const renderPageOverlay = useCallback(
    (pageIndex: number, rotatedWidth: number) => {
      const translation = pageTranslationFor(pageIndex);
      if (!translation) return null;
      return (
        <PdfiumPageTranslationOverlay
          layout={overlayState.layoutsByPage.get(pageIndex) ?? null}
          pageIndex={pageIndex}
          rotatedWidth={rotatedWidth}
          translation={translation}
          onEnsureLayout={ensurePageLayout}
          onRetryBlock={pageIndex === currentPageIndex ? session.retryBlock : undefined}
        />
      );
    },
    [
      currentPageIndex,
      ensurePageLayout,
      overlayState.layoutsByPage,
      pageTranslationFor,
      session.retryBlock,
    ],
  );

  return {
    dialog: session.dialog,
    renderPageOverlay,
    toolbar: session.toolbar,
    visible: session.visible,
  };
}

function PdfiumPageTranslationOverlay({
  layout,
  onEnsureLayout,
  onRetryBlock,
  pageIndex,
  rotatedWidth,
  translation,
}: {
  layout: PdfPageTranslationLayout | null;
  onEnsureLayout: (pageIndex: number) => Promise<PdfPageTranslationLayout | undefined>;
  onRetryBlock?: (blockId: string) => void;
  pageIndex: number;
  rotatedWidth: number;
  translation: ArticleTranslation;
}) {
  const { t } = useTranslation();
  const requestLayout = useCallback(
    (marker: HTMLElement | null) => {
      if (marker) void onEnsureLayout(pageIndex).catch(() => undefined);
    },
    [onEnsureLayout, pageIndex],
  );

  return (
    <div
      className="pdfium-translation-overlay"
      data-pdfium-translation-page={pageIndex}
      style={{ '--pdf-page-width': `${rotatedWidth}px` } as React.CSSProperties}
    >
      {!layout ? <span hidden key={pageIndex} ref={requestLayout} /> : null}
      {layout
        ? translation.segments.map((segment) => {
            const bounds = layout.boundsByBlockId.get(segment.sourceBlockId);
            if (!bounds) return null;
            const style: React.CSSProperties = {
              left: `${bounds.x * 100}%`,
              top: `${bounds.y * 100}%`,
              width: `${Math.max(bounds.width * 100, 12)}%`,
              minHeight: `${bounds.height * 100}%`,
            };

            if (segment.status === 'failed') {
              if (!onRetryBlock) return null;
              return (
                <div
                  className="pdfium-translation-block is-failed"
                  data-pdfium-translation-block={segment.sourceBlockId}
                  key={segment.sourceBlockId}
                  style={style}
                >
                  <button
                    className="pdfium-translation-retry"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRetryBlock(segment.sourceBlockId);
                    }}
                  >
                    {t('readerTranslation.common.retryTranslationSegment')}
                  </button>
                </div>
              );
            }

            if (segment.status === 'translating') {
              return (
                <div
                  className="pdfium-translation-block is-loading"
                  data-pdfium-translation-block={segment.sourceBlockId}
                  key={segment.sourceBlockId}
                  style={style}
                >
                  <span>{t('readerTranslation.pdfPage.translating')}</span>
                </div>
              );
            }

            if (!segment.translatedText) return null;
            return (
              <div
                className="pdfium-translation-block is-ready"
                data-pdfium-translation-block={segment.sourceBlockId}
                key={segment.sourceBlockId}
                style={style}
              >
                <p>{segment.translatedText}</p>
              </div>
            );
          })
        : null}
    </div>
  );
}

function pdfPageIndexFromSourceId(sourceId: string | undefined) {
  if (!sourceId) return null;
  const match = /^pdf-page-(\d+)$/.exec(sourceId);
  return match ? Number(match[1]) : null;
}
