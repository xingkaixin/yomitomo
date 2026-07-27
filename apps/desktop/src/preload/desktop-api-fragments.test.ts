import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcInvokeRoutes } from '../ipc-contract';
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
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

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

    const first = api.app.readPdfiumWasmUrl();
    const second = api.app.readPdfiumWasmUrl();

    expect(first).toBe(second);
    await expect(first).resolves.toBe('file:///packaged/pdfium.wasm');
    expect(electronMocks.invoke).toHaveBeenCalledOnce();
    expect(electronMocks.invoke).toHaveBeenCalledWith('app:pdfium-wasm-url');
  });

  it('builds every declared invoke route without exposing flat aliases', () => {
    const api = createYomitomoDesktopApi({
      platform: 'darwin',
      preloadLoadedAt: 1,
    });
    const routePaths = Object.values(desktopIpcInvokeRoutes).map((route) => route.join('.'));

    expect(new Set(routePaths).size).toBe(routePaths.length);

    for (const route of Object.values(desktopIpcInvokeRoutes)) {
      let operation: unknown = api;
      for (const segment of route) {
        operation = (operation as Record<string, unknown>)[segment];
      }
      expect(operation, route.join('.')).toBeTypeOf('function');
    }

    expect(api).not.toHaveProperty('getAppInfo');
    expect(api).not.toHaveProperty('saveSettings');
  });

  it('invokes only the channel assigned to a domain operation', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, value: { providers: [] } });
    const api = createYomitomoDesktopApi({
      platform: 'darwin',
      preloadLoadedAt: 1,
    });

    await api.provider.delete('provider_1');

    expect(electronMocks.invoke).toHaveBeenCalledOnce();
    expect(electronMocks.invoke).toHaveBeenCalledWith('provider:delete', 'provider_1');
  });

  it('keeps the typed store load error behavior', async () => {
    electronMocks.invoke.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        error: {
          code: 'DATABASE_TOO_NEW',
          message: '请安装最新版继续使用。',
        },
      },
    });
    const api = createYomitomoDesktopApi({
      platform: 'darwin',
      preloadLoadedAt: 1,
    });

    await expect(api.store.getState()).rejects.toMatchObject({
      code: 'DATABASE_TOO_NEW',
      message: '请安装最新版继续使用。',
    });
    expect(electronMocks.invoke).toHaveBeenCalledWith('store:get');
  });
});
