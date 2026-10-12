// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import type { PdfEngine } from '@embedpdf/models';
import { afterEach, expect, it, vi } from 'vitest';
import { EmbedPdfSelectionBridge } from './app-source-bookcase-pdfium-selection-bridge';

const embedPdf = vi.hoisted(() => {
  const listeners = {
    change: (_range: unknown) => {},
    end: () => {},
  };
  const scope = {
    clear: vi.fn(),
    getFormattedSelection: () => [
      {
        pageIndex: 0,
        segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 100, height: 16 } }],
      },
    ],
    getState: () => ({ slices: { 0: { start: 0, count: 5 } } }),
    onSelectionChange: (listener: (range: unknown) => void) => {
      listeners.change = listener;
      return () => {};
    },
    onEndSelection: (listener: () => void) => {
      listeners.end = listener;
      return () => {};
    },
  };
  return { listeners, scope };
});

vi.mock('@embedpdf/core/react', () => ({
  useDocumentState: () => ({ document: { pages: [{ size: { width: 600, height: 800 } }] } }),
}));

vi.mock('@embedpdf/plugin-selection/react', () => ({
  useSelectionCapability: () => ({ provides: { forDocument: () => embedPdf.scope } }),
}));

afterEach(cleanup);

it('drops page text that arrives after the user cleared the selection', async () => {
  let resolvePageText!: (text: string) => void;
  const pageText = new Promise<string>((resolve) => {
    resolvePageText = resolve;
  });
  const engine = { extractText: () => ({ toPromise: () => pageText }) } as unknown as PdfEngine;
  const onSelection = vi.fn();
  render(
    <EmbedPdfSelectionBridge
      documentId="doc"
      engine={engine}
      onInvalidSelection={vi.fn()}
      onSelection={onSelection}
    />,
  );

  act(() => embedPdf.listeners.end());
  act(() => embedPdf.listeners.change(null));
  await act(async () => resolvePageText('Hello world'));

  expect(onSelection).toHaveBeenCalledExactlyOnceWith(null);
  expect(embedPdf.scope.clear).not.toHaveBeenCalled();
});
