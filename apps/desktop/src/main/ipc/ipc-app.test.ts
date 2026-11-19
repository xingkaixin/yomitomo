import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { resetDesktopIpcRegistrationsForTest } from './ipc';
import { registerAppIpc } from './ipc-app';

const electronState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    documentsDir: '',
    showSaveDialog: vi.fn(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronState.documentsDir),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  dialog: {
    showSaveDialog: electronState.showSaveDialog,
  },
  ipcMain: {
    handle: electronState.handle,
    on: electronState.on,
  },
}));

vi.mock('../store/store-db', () => ({
  withDatabaseLease: (operation: () => Promise<unknown>) => operation(),
}));

let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yomitomo-md-export-'));
  electronState.documentsDir = tempDir;
  electronState.handlers.clear();
  electronState.showSaveDialog.mockReset();
  resetDesktopIpcRegistrationsForTest();
  registerAppIpc({
    getAppVersion: () => '1.0.0',
    openExternalUrl: vi.fn(),
    recordPerformanceTiming: vi.fn(),
    recordStartupTiming: vi.fn(),
  });
});

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe('app:save-markdown-file IPC', () => {
  it('sanitizes defaultFileName, writes verbatim UTF-8 markdown, and handles dialog cancellation', async () => {
    const targetPath = join(tempDir, 'exported-notes.md');
    electronState.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: targetPath });

    const saved = await invokeRegisteredHandler('app:save-markdown-file', {
      defaultFileName: '../unsafe/title:notes',
      content: '# Title\n\n> Verbatim highlight\n',
    });

    expect(electronState.showSaveDialog).toHaveBeenCalledWith({
      defaultPath: join(tempDir, 'unsafe title notes.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    expect(saved).toEqual({ ok: true, value: { canceled: false, filePath: targetPath } });
    expect(await readFile(targetPath, 'utf8')).toBe('# Title\n\n> Verbatim highlight\n');

    electronState.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const canceled = await invokeRegisteredHandler('app:save-markdown-file', {
      defaultFileName: 'notes',
      content: '# Ignored',
    });
    expect(canceled).toEqual({ ok: true, value: { canceled: true } });
  });

  it('rejects invalid empty file names through schema validation before opening the dialog', async () => {
    const invalid = await invokeRegisteredHandler('app:save-markdown-file', {
      defaultFileName: '   ',
      content: '# Title',
    });

    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'app:save-markdown-file' },
      },
    });
    expect(electronState.showSaveDialog).not.toHaveBeenCalled();
  });
});

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = electronState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({ sender: {} }, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}
