import { useCallback, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import i18next from 'i18next';
import { useDocumentState } from '@embedpdf/core/react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import type { PdfEngine } from '@embedpdf/models';
import { createPdfTextAnchor } from '@yomitomo/shared';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { rectToPdfRect } from './pdfium-geometry';

export function EmbedPdfSelectionBridge({
  documentId,
  engine,
  onInvalidSelection,
  onSelection,
}: {
  documentId: string;
  engine: PdfEngine;
  onInvalidSelection: (message: string) => void;
  onSelection: (anchor: ReturnType<typeof createPdfTextAnchor> | null) => void;
}) {
  const documentState = useDocumentState(documentId);
  const { provides } = useSelectionCapability();
  const ignoreSelectionClearUntilRef = useRef(0);
  const selectionGenerationRef = useRef(0);
  const selected = useStableCallback(onSelection);
  const selectionRejected = useStableCallback(onInvalidSelection);
  const readSelectionSource = useStableCallback(() => ({
    document: documentState?.document,
    documentId,
    engine,
    provides,
  }));

  useMountEffect(() => () => {
    selectionGenerationRef.current += 1;
  });

  const subscribeToSelection = useCallback((marker: HTMLElement | null) => {
    const { documentId: selectionDocumentId, provides: selection } = readSelectionSource();
    if (!marker || !selection) return;
    const scope = selection.forDocument(selectionDocumentId);

    const unsubscribeChange = scope.onSelectionChange((selectionRange) => {
      if (selectionRange) return;
      if (performance.now() < ignoreSelectionClearUntilRef.current) {
        return;
      }
      selectionGenerationRef.current += 1;
      selected(null);
    });
    const unsubscribeEnd = scope.onEndSelection(() => {
      const { document, engine: selectionEngine } = readSelectionSource();
      if (!document) return;
      const generation = ++selectionGenerationRef.current;
      const state = scope.getState();
      const formattedSelections = scope.getFormattedSelection();
      if (formattedSelections.length > 1) {
        clearEmbedPdfSelection(scope);
        selected(null);
        selectionRejected(i18next.t('pdfReader.crossPageSelectionUnsupported'));
        return;
      }

      const formatted = formattedSelections[0];
      if (!formatted) return;
      const slice = state.slices[formatted.pageIndex];
      const page = document.pages[formatted.pageIndex];
      if (!slice || !page) return;

      selectionEngine
        .extractText(document, [formatted.pageIndex])
        .toPromise()
        .then((pageText) => {
          if (generation !== selectionGenerationRef.current) return;
          const anchor = createPdfTextAnchor({
            pageText,
            pageIndex: formatted.pageIndex,
            start: slice.start,
            end: slice.start + slice.count,
            pageWidth: page.size.width,
            pageHeight: page.size.height,
            rects: formatted.segmentRects.map((rect) =>
              rectToPdfRect(rect, page.size.width, page.size.height),
            ),
          });
          ignoreSelectionClearUntilRef.current = performance.now() + 120;
          selected(anchor.exact.trim() ? anchor : null);
          clearEmbedPdfSelection(scope);
        })
        .catch(() => {
          if (generation !== selectionGenerationRef.current) return;
          selected(null);
        });
    });

    return () => {
      unsubscribeChange();
      unsubscribeEnd();
    };
  }, []);

  // Embedpdf exposes the selection capability and document after the registry initializes.
  return provides && documentState?.document ? <span hidden ref={subscribeToSelection} /> : null;
}

function clearEmbedPdfSelection(scope: unknown) {
  const selectionScope = scope as {
    clear?: () => void;
    clearSelection?: () => void;
  };
  selectionScope.clearSelection?.();
  selectionScope.clear?.();
}
