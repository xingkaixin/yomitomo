// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import { usePdfiumDocumentSource } from '../source/pdfium/use-pdfium-document-source';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };
type PdfiumDocumentSourceState = ReturnType<typeof usePdfiumDocumentSource>;

const engineMocks = vi.hoisted(() => ({
  usePdfiumEngine: vi.fn(() => ({
    engine: { id: 'engine' },
    error: null,
    isLoading: false,
  })),
}));

vi.mock('@embedpdf/engines/react', () => ({
  usePdfiumEngine: engineMocks.usePdfiumEngine,
}));

function pdfArticle(): PdfArticleRecord {
  return {
    id: 'pdf_article_1',
    sourceType: 'pdf',
    title: 'PDF article',
    pdf: {
      metadata: {
        fileSize: 3,
        pageCount: 1,
        title: 'PDF article',
      },
    },
  } as PdfArticleRecord;
}

describe('usePdfiumDocumentSource', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, 'yomitomoDesktop');
  });

  it('uses the IPC ArrayBuffer without an extra renderer copy', async () => {
    const data = new Uint8Array([1, 2, 3]).buffer;
    const readPdfFile = vi.fn().mockResolvedValue(data);
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        readPdfFile,
        recordPerformanceTiming,
      },
    });
    let state: PdfiumDocumentSourceState | null = null;

    function Probe() {
      state = usePdfiumDocumentSource(pdfArticle());
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(state?.buffer).toBe(data);
    });
    const fileReadDone = recordPerformanceTiming.mock.calls
      .map(([input]) => input)
      .find((input) => input.event === 'pdf.open' && input.data?.phase === 'file_read_done');

    expect(readPdfFile).toHaveBeenCalledWith('pdf_article_1');
    expect(fileReadDone?.data).toMatchObject({
      byteLength: 3,
      copyDurationMs: 0,
      ipcByteLength: 3,
      rendererCopiedBuffer: false,
    });
  });
});
