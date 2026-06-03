import { useEffect, useRef } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import type { PdfEngine } from '@embedpdf/models';
import { createPdfTextAnchor } from '@yomitomo/shared';
import { rectToPdfRect } from './app-source-bookcase-pdfium-utils';

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

  useEffect(() => {
    if (!provides || !documentState?.document) return;
    const scope = provides.forDocument(documentId);
    const document = documentState.document;

    const unsubscribeChange = scope.onSelectionChange((selectionRange) => {
      if (selectionRange) return;
      if (performance.now() < ignoreSelectionClearUntilRef.current) {
        return;
      }
      onSelection(null);
    });
    const unsubscribeEnd = scope.onEndSelection(() => {
      const state = scope.getState();
      const formattedSelections = scope.getFormattedSelection();
      if (formattedSelections.length > 1) {
        clearEmbedPdfSelection(scope);
        onSelection(null);
        onInvalidSelection('暂不支持跨页划线，请选择单页文本');
        return;
      }

      const formatted = formattedSelections[0];
      if (!formatted) return;
      const slice = state.slices[formatted.pageIndex];
      const page = document.pages[formatted.pageIndex];
      if (!slice || !page) return;

      engine
        .extractText(document, [formatted.pageIndex])
        .toPromise()
        .then((pageText) => {
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
          onSelection(anchor.exact.trim() ? anchor : null);
          clearEmbedPdfSelection(scope);
        })
        .catch(() => {
          onSelection(null);
        });
    });

    return () => {
      unsubscribeChange();
      unsubscribeEnd();
    };
  }, [documentId, documentState?.document, engine, onInvalidSelection, onSelection, provides]);

  return null;
}

function clearEmbedPdfSelection(scope: unknown) {
  const selectionScope = scope as {
    clear?: () => void;
    clearSelection?: () => void;
  };
  selectionScope.clearSelection?.();
  selectionScope.clear?.();
}
