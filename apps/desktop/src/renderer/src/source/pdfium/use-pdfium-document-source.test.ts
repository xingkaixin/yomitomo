import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPdfiumWasmUrl: vi.fn<() => Promise<string>>(),
}));

vi.mock('../../shell/app-desktop-api', () => ({
  getDesktopApi: () => ({
    app: {
      readPdfiumWasmUrl: mocks.readPdfiumWasmUrl,
    },
  }),
}));

vi.mock('@embedpdf/pdfium/pdfium.wasm?url', () => ({
  default: 'mock-dev-pdfium.wasm',
}));

describe('readPdfiumWasmUrlOnce', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.readPdfiumWasmUrl.mockReset();
  });

  it('retries after a transient failure and caches the resolved promise afterward', async () => {
    mocks.readPdfiumWasmUrl
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValueOnce('file:///app/resources/pdfium/pdfium.wasm');

    const { readPdfiumWasmUrlOnce } = await import('./use-pdfium-document-source');

    await expect(readPdfiumWasmUrlOnce()).rejects.toThrow('IPC unavailable');

    const secondPromise = readPdfiumWasmUrlOnce();
    const thirdPromise = readPdfiumWasmUrlOnce();
    expect(thirdPromise).toBe(secondPromise);
    await expect(secondPromise).resolves.toBe('file:///app/resources/pdfium/pdfium.wasm');
    expect(mocks.readPdfiumWasmUrl).toHaveBeenCalledTimes(2);
  });
});
