import type { ArticleRecord } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workerMocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class MockWorker {
    static nextMessage: unknown;
    static delayMessage = false;

    readonly handlers = new Map<string, Handler[]>();
    readonly url: URL;
    readonly workerData: unknown;
    terminated = false;

    constructor(url: URL, options: { workerData?: unknown }) {
      this.url = url;
      this.workerData = options.workerData;
      instances.push(this);

      if (MockWorker.nextMessage !== undefined && !MockWorker.delayMessage) {
        queueMicrotask(() => this.emit('message', MockWorker.nextMessage));
      }
    }

    once(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      const handlers = this.handlers.get(event) || [];
      this.handlers.delete(event);
      handlers.forEach((handler) => handler(...args));
    }

    async terminate() {
      this.terminated = true;
    }
  }

  const instances: MockWorker[] = [];

  return { instances, MockWorker };
});

vi.mock('node:worker_threads', () => ({
  Worker: workerMocks.MockWorker,
}));

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    readonly webContents = {
      executeJavaScript: vi.fn(),
    };

    destroyed = false;

    async loadURL() {
      return undefined;
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
    }
  },
}));

import { articleRecordFromUrl, cancelArticleImport } from './article-import';

describe('article import', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    workerMocks.instances.length = 0;
    workerMocks.MockWorker.nextMessage = undefined;
    workerMocks.MockWorker.delayMessage = false;
  });

  it('fetches html and extracts the article in a worker', async () => {
    const article = articleRecord();
    workerMocks.MockWorker.nextMessage = { ok: true, article };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<html><body>正文</body></html>'));

    await expect(
      articleRecordFromUrl('example.com/post', { inlineImages: true, requestId: 'import-1' }),
    ).resolves.toEqual(article);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/post',
      expect.objectContaining({ redirect: 'follow' }),
    );
    expect(workerMocks.instances).toHaveLength(1);
    expect(workerMocks.instances[0].workerData).toMatchObject({
      html: '<html><body>正文</body></html>',
      inlineImages: true,
      url: 'https://example.com/post',
    });
    expect(workerMocks.instances[0].terminated).toBe(true);
    expect(cancelArticleImport('import-1')).toBe(false);
  });

  it('maps fetch AbortError to the import timeout code', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    await expect(articleRecordFromUrl('https://example.com/post')).rejects.toThrow(
      'ARTICLE_IMPORT_TIMEOUT',
    );
    expect(workerMocks.instances).toHaveLength(0);
  });

  it('cancels an active worker import and cleans up the task', async () => {
    workerMocks.MockWorker.delayMessage = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html><body>正文</body></html>'));

    const pending = articleRecordFromUrl('https://example.com/post', {
      requestId: 'import-cancel',
    });
    await vi.waitFor(() => expect(workerMocks.instances).toHaveLength(1));

    expect(cancelArticleImport('import-cancel')).toBe(true);
    await expect(pending).rejects.toThrow('ARTICLE_IMPORT_CANCELED');
    expect(workerMocks.instances[0].terminated).toBe(true);
    expect(cancelArticleImport('import-cancel')).toBe(false);
  });
});

function articleRecord(): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: 'Article',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };
}
