import { describe, expect, it, vi } from 'vitest';
import { createYomitomoDesktopApi } from './desktop-api-fragments';

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));

describe('createYomitomoDesktopApi', () => {
  it('loads and caches the PDFium wasm URL asynchronously', async () => {
    electronMocks.invoke.mockResolvedValue({
      ok: true,
      value: 'file:///packaged/pdfium.wasm',
    });

    const api = createYomitomoDesktopApi({
      platform: 'darwin',
      preloadLoadedAt: 1,
    });

    expect(electronMocks.invoke).not.toHaveBeenCalled();

    const first = api.readPdfiumWasmUrl();
    const second = api.readPdfiumWasmUrl();

    expect(first).toBe(second);
    await expect(first).resolves.toBe('file:///packaged/pdfium.wasm');
    expect(electronMocks.invoke).toHaveBeenCalledOnce();
    expect(electronMocks.invoke).toHaveBeenCalledWith('app:pdfium-wasm-url');
  });
});
