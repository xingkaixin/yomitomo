import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { MAX_PDF_IMPORT_BYTES, type ArticleImportUrlInput } from '../../ipc-contract';
import { desktopIpcInvokeSchemaChannels } from '../../ipc-schemas';
import { handleDesktopIpc } from './ipc';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

beforeEach(() => {
  ipcHandlers.clear();
});

describe('handleDesktopIpc', () => {
  it('passes validated args to the channel handler', async () => {
    const handler = vi.fn(async (_event, _input: ArticleImportUrlInput) => ({
      status: 'canceled' as const,
    }));
    handleDesktopIpc('article:import-url', handler);

    const input = { url: 'https://example.com' };
    const envelope = await invokeRegisteredHandler('article:import-url', input);

    expect(envelope).toEqual({ ok: true, value: { status: 'canceled' } });
    expect(handler).toHaveBeenCalledWith({}, input);
  });

  it('rejects malformed URL imports before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('article:import-url', handler);

    const envelope = await invokeRegisteredHandler('article:import-url', {
      url: 'file:///tmp/article.html',
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'article:import-url' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects oversized PDF imports before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('pdf:import-file', handler);

    const envelope = await invokeRegisteredHandler('pdf:import-file', {
      data: new ArrayBuffer(MAX_PDF_IMPORT_BYTES + 1),
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'pdf:import-file' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid collection member refs before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('library-collection:add-members', handler);

    const envelope = await invokeRegisteredHandler('library-collection:add-members', {
      collectionId: 'collection_1',
      members: [{ kind: 'collection', id: 'collection_2' }],
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'library-collection:add-members' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps explicitly exempt args unchanged', async () => {
    const handler = vi.fn(async () => undefined);
    handleDesktopIpc('url:open', handler);

    const envelope = await invokeRegisteredHandler('url:open', 'custom-scheme:value');

    expect(envelope).toEqual({ ok: true, value: undefined });
    expect(handler).toHaveBeenCalledWith({}, 'custom-scheme:value');
  });

  it('derives schema channels from the invoke schema registry', () => {
    expect(desktopIpcInvokeSchemaChannels).toContain('article:import-url');
    expect(desktopIpcInvokeSchemaChannels).not.toContain('settings:save');
  });
});

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}
