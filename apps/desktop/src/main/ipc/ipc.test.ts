import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import {
  desktopIpcInvokeDescriptors,
  MAX_PDF_IMPORT_BYTES,
  type ArticleImportUrlInput,
} from '../../ipc-contract';
import {
  MAX_TEXT_IMPORT_BATCH_BYTES,
  MAX_TEXT_IMPORT_BODY_CHARS,
  MAX_TEXT_IMPORT_BYTES,
} from '../../ipc/article-import-boundary';
import { desktopIpcInvokeSchemaChannels } from '../../ipc-schemas';
import {
  assertDesktopIpcRegistrationComplete,
  handleDesktopIpc,
  resetDesktopIpcRegistrationsForTest,
} from './ipc';

const ipcState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  };
});

const databaseLeaseState = vi.hoisted(() => ({
  active: false,
  run: vi.fn(async (operation: () => Promise<unknown>) => {
    databaseLeaseState.active = true;
    try {
      return await operation();
    } finally {
      databaseLeaseState.active = false;
    }
  }),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcState.handle,
  },
}));

vi.mock('../store/store-db', () => ({
  withDatabaseLease: databaseLeaseState.run,
}));

beforeEach(() => {
  ipcState.handlers.clear();
  databaseLeaseState.active = false;
  databaseLeaseState.run.mockClear();
  resetDesktopIpcRegistrationsForTest();
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

  it('holds database-dependent handlers inside the database lease', async () => {
    const handler = vi.fn(async () => {
      expect(databaseLeaseState.active).toBe(true);
      return { status: 'canceled' as const };
    });
    handleDesktopIpc('article:import-url', handler);

    await invokeRegisteredHandler('article:import-url', { url: 'https://example.com' });

    expect(databaseLeaseState.run).toHaveBeenCalledOnce();
  });

  it('releases the database lease before running independent handlers', async () => {
    const handler = vi.fn(async () => {
      expect(databaseLeaseState.active).toBe(false);
    });
    handleDesktopIpc('url:open', handler);

    await invokeRegisteredHandler('url:open', 'https://example.com');

    expect(databaseLeaseState.run).toHaveBeenCalledOnce();
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

  it('accepts a text import batch that fills the budget exactly', async () => {
    const handler = vi.fn(async () => ({ items: [] }));
    handleDesktopIpc('text:import-prepare', handler);

    const envelope = await invokeRegisteredHandler('text:import-prepare', {
      kind: 'files',
      files: textImportFiles(MAX_TEXT_IMPORT_BATCH_BYTES),
    });

    expect(envelope).toEqual({ ok: true, value: { items: [] } });
  });

  it('rejects a text import batch one byte over the budget', async () => {
    const handler = vi.fn();
    handleDesktopIpc('text:import-prepare', handler);

    const envelope = await invokeRegisteredHandler('text:import-prepare', {
      kind: 'files',
      files: textImportFiles(MAX_TEXT_IMPORT_BATCH_BYTES + 1),
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: { code: desktopIpcErrorCodes.invalidArgs, detail: { channel: 'text:import-prepare' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a text commit whose bodies exceed the character budget', async () => {
    const handler = vi.fn();
    handleDesktopIpc('text:import-commit', handler);

    const body = 'x'.repeat(MAX_TEXT_IMPORT_BODY_CHARS);
    const envelope = await invokeRegisteredHandler('text:import-commit', {
      items: Array.from({ length: 4 }, (_, index) => ({
        title: `Doc ${index}`,
        format: 'plain',
        body,
      })),
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: { code: desktopIpcErrorCodes.invalidArgs, detail: { channel: 'text:import-commit' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts valid custom-scheme URLs', async () => {
    const handler = vi.fn(async () => undefined);
    handleDesktopIpc('url:open', handler);

    const envelope = await invokeRegisteredHandler('url:open', 'custom-scheme:value');

    expect(envelope).toEqual({ ok: true, value: undefined });
    expect(handler).toHaveBeenCalledWith({}, 'custom-scheme:value');
  });

  it('rejects malformed settings before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('settings:save', handler);

    const envelope = await invokeRegisteredHandler('settings:save', {
      soundEffectsVolume: 2,
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: { code: desktopIpcErrorCodes.invalidArgs, detail: { channel: 'settings:save' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects incomplete domain payloads before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('article:delete-annotation', handler);

    const envelope = await invokeRegisteredHandler('article:delete-annotation', {
      articleId: 'article_1',
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'article:delete-annotation' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('derives schema channels from the invoke schema registry', () => {
    expect(desktopIpcInvokeSchemaChannels).toContain('article:import-url');
    expect(desktopIpcInvokeSchemaChannels).toContain('settings:save');
  });

  it('reports every missing declared handler in stable order', () => {
    handleDesktopIpc('url:open', async () => undefined);

    expect(() => assertDesktopIpcRegistrationComplete()).toThrow(
      `Missing desktop IPC handlers: ${missingDesktopIpcHandlers('url:open')}`,
    );
  });

  it('records a channel only after Electron accepts its handler', () => {
    ipcState.handle.mockImplementationOnce(() => {
      throw new Error('registration failed');
    });

    expect(() => handleDesktopIpc('url:open', async () => undefined)).toThrow(
      'registration failed',
    );
    expect(() => assertDesktopIpcRegistrationComplete()).toThrow(
      `Missing desktop IPC handlers: ${missingDesktopIpcHandlers()}`,
    );
  });
});

function textImportFiles(totalBytes: number) {
  const fileCount = Math.ceil(totalBytes / MAX_TEXT_IMPORT_BYTES);
  let remaining = totalBytes;
  return Array.from({ length: fileCount }, (_, index) => {
    const byteLength = Math.min(remaining, MAX_TEXT_IMPORT_BYTES);
    remaining -= byteLength;
    return { fileName: `note-${index}.txt`, data: new ArrayBuffer(byteLength) };
  });
}

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}

function missingDesktopIpcHandlers(registeredChannel?: string) {
  return Object.keys(desktopIpcInvokeDescriptors)
    .filter((channel) => channel !== registeredChannel)
    .toSorted()
    .join(', ');
}
