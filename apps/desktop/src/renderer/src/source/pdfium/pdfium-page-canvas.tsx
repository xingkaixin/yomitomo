import { useCallback, useRef } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useRenderCapability } from '@embedpdf/plugin-render/react';

// EmbedPDF's RenderLayer encodes each page to PNG and decodes it again in an <img>. Drawing the raw
// pixels skips those full-size bitmap copies, which dominate memory while scrolling large pages.
export function PdfiumPageCanvas({
  documentId,
  pageIndex,
}: {
  documentId: string;
  pageIndex: number;
}) {
  const { provides: render } = useRenderCapability();
  const documentState = useDocumentState(documentId);
  const scale = documentState?.scale ?? 1;
  const refreshVersion = documentState?.pageRefreshVersions[pageIndex] ?? 0;
  const dpr = window.devicePixelRatio;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderPage = useCallback(
    (marker: HTMLElement | null) => {
      const canvas = canvasRef.current;
      if (!marker || !canvas || !render) return;
      const task = render.forDocument(documentId).renderPageRaw({
        pageIndex,
        options: { scaleFactor: scale, dpr },
      });
      task.wait(({ data, height, width }) => {
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.putImageData(new ImageData(data, width, height), 0, 0);
      }, ignore);
      return () => task.abort({ code: PdfErrorCode.Cancelled, message: 'canceled render task' });
    },
    [documentId, dpr, pageIndex, render, scale],
  );

  return (
    <>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      <span hidden key={`${scale}:${dpr}:${refreshVersion}`} ref={renderPage} />
    </>
  );
}
