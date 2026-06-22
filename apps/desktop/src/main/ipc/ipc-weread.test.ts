import { describe, expect, it, vi } from 'vitest';
import type { WeReadBook, WeReadBookDetail } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { registerWeReadIpc } from './ipc-weread';
import { fetchWeReadSyncDetails } from '../weread/weread-sync';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

describe('weread IPC persistence boundary', () => {
  it('reads WeRead API keys through WeRead persistence only', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const readStoredWeReadApiKey = vi.fn(async () => 'weread-secret');

    registerWeReadIpc({
      getPersistenceModule: async () => ({
        weReadPersistence: { readStoredWeReadApiKey },
      }),
    } as unknown as DesktopMainIpcContext);

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'weread:read-api-key',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({});

    expect(result).toEqual({ ok: true, value: 'weread-secret' });
    expect(readStoredWeReadApiKey).toHaveBeenCalled();
  });

  it('reconfigures auto sync after saving settings', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const state = {
      settings: { configured: true, openMethod: 'deeplink', syncMode: 'auto' },
      books: [],
    };
    const saveWeReadSettings = vi.fn(async () => state);
    const configureWeReadAutoSync = vi.fn();

    registerWeReadIpc({
      configureWeReadAutoSync,
      getPersistenceModule: async () => ({
        weReadPersistence: { saveWeReadSettings },
      }),
    } as unknown as DesktopMainIpcContext);

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'weread:save-settings',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { syncMode: 'auto' });

    expect(result).toEqual({ ok: true, value: state });
    expect(saveWeReadSettings).toHaveBeenCalledWith({ syncMode: 'auto' });
    expect(configureWeReadAutoSync).toHaveBeenCalledWith('settings-saved');
  });
});

describe('weread IPC sync detail loading', () => {
  it('limits full sync detail fetches to the configured concurrency', async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let completed = 0;
    let maxActive = 0;

    const promise = fetchWeReadSyncDetails({
      books: Array.from({ length: 7 }, (_, index) => book(`book_${index}`)),
      fetchBookDetail: async (bookId) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        completed += 1;
        return detail(bookId);
      },
      hasValidContent: () => true,
      mergeNotebookBook: (bookDetail) => bookDetail,
      logError: vi.fn(),
      logInfo: vi.fn(),
      elapsedMs: () => 1,
      concurrency: 3,
    });

    await flushTasks();
    expect(active).toBe(3);

    for (let index = 0; index < 7; index += 1) {
      releases.shift()?.();
      await flushTasks();
    }
    expect(completed).toBe(7);

    await expect(promise).resolves.toHaveLength(7);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('logs book context when a detail fetch fails', async () => {
    const error = new Error('timeout');
    const logError = vi.fn();

    await expect(
      fetchWeReadSyncDetails({
        books: [book('book_failed', '失败书籍')],
        fetchBookDetail: async () => {
          throw error;
        },
        hasValidContent: () => true,
        mergeNotebookBook: (bookDetail) => bookDetail,
        logError,
        logInfo: vi.fn(),
        elapsedMs: () => 1,
      }),
    ).rejects.toThrow(error);

    expect(logError).toHaveBeenCalledWith('weread.sync.book_detail_failed', error, {
      bookId: 'book_failed',
      title: '失败书籍',
      stage: 'book_detail',
      durationMs: 1,
    });
  });
});

function book(bookId: string, title = bookId): WeReadBook {
  return {
    bookId,
    title,
    reviewCount: 1,
    noteCount: 0,
    bookmarkCount: 0,
    readingProgress: 0,
    syncedAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  };
}

function detail(bookId: string): WeReadBookDetail {
  return {
    book: book(bookId),
    chapters: [],
    highlights: [],
    thoughts: [
      {
        reviewId: `thought_${bookId}`,
        bookId,
        content: 'note',
        chapterUid: 1,
        chapterIdx: 1,
        range: '0-1',
        createTime: 0,
      },
    ],
  };
}

async function flushTasks() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
