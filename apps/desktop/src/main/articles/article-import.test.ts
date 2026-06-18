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
      executeJavaScript: vi.fn().mockImplementation(() =>
        Promise.resolve(
          browserWindowMocks.nextRenderedPage || {
            html: '<html><body>正文</body></html>',
            htmlByteLength: 32,
            text: '正文',
            title: 'Article',
            url: 'https://example.com/post',
          },
        ),
      ),
      session: {
        clearCache: vi.fn().mockResolvedValue(undefined),
        clearStorageData: vi.fn().mockResolvedValue(undefined),
      },
    };
    readonly options: {
      webPreferences?: {
        partition?: string;
        sandbox?: boolean;
      };
    };

    destroyed = false;

    constructor(options: {
      webPreferences?: {
        partition?: string;
        sandbox?: boolean;
      };
    }) {
      this.options = options;
      browserWindowMocks.instances.push(this);
    }

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

const browserWindowMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    destroyed: boolean;
    options: {
      webPreferences?: {
        partition?: string;
        sandbox?: boolean;
      };
    };
    webContents: {
      session: {
        clearCache: ReturnType<typeof vi.fn>;
        clearStorageData: ReturnType<typeof vi.fn>;
      };
    };
  }>,
  nextRenderedPage: undefined as
    | {
        html: string;
        htmlByteLength?: number;
        text: string;
        title: string;
        url: string;
      }
    | undefined,
}));

import {
  articleRecordFromUrl,
  cancelArticleImport,
  MAX_ARTICLE_IMPORT_HTML_BYTES,
} from './article-import';

describe('article import', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    workerMocks.instances.length = 0;
    browserWindowMocks.instances.length = 0;
    browserWindowMocks.nextRenderedPage = undefined;
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

  it('rejects non-html response content types before worker parsing', async () => {
    const article = articleRecord();
    workerMocks.MockWorker.nextMessage = { ok: true, article };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('%PDF-1.7 binary', {
        headers: { 'content-type': 'application/pdf' },
      }),
    );

    await expect(articleRecordFromUrl('https://example.com/file.pdf')).rejects.toThrow(
      'ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE',
    );

    expect(workerMocks.instances).toHaveLength(0);
  });

  it('rejects html responses with content-length over the import limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>正文</body></html>', {
        headers: {
          'content-length': String(MAX_ARTICLE_IMPORT_HTML_BYTES + 1),
          'content-type': 'text/html',
        },
      }),
    );

    await expect(articleRecordFromUrl('https://example.com/large')).rejects.toThrow(
      'ARTICLE_IMPORT_RESPONSE_TOO_LARGE',
    );

    expect(workerMocks.instances).toHaveLength(0);
  });

  it('cancels streaming response reads when the body exceeds the import limit', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_ARTICLE_IMPORT_HTML_BYTES + 1));
      },
      cancel,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(articleRecordFromUrl('https://example.com/stream')).rejects.toThrow(
      'ARTICLE_IMPORT_RESPONSE_TOO_LARGE',
    );

    expect(cancel).toHaveBeenCalled();
    expect(workerMocks.instances).toHaveLength(0);
  });

  it('allows missing or inaccurate content types when the limited body is html', async () => {
    const article = articleRecord();
    workerMocks.MockWorker.nextMessage = { ok: true, article };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<html><body>正文</body></html>'))
      .mockResolvedValueOnce(
        new Response('<!doctype html><html><body>正文</body></html>', {
          headers: { 'content-type': 'text/plain' },
        }),
      );

    await expect(articleRecordFromUrl('https://example.com/missing-type')).resolves.toEqual(
      article,
    );
    await expect(articleRecordFromUrl('https://example.com/plain-type')).resolves.toEqual(article);

    expect(workerMocks.instances).toHaveLength(2);
  });

  it('rejects rendered fallback html over the import limit', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>cf-browser-verification</html>'),
    );
    browserWindowMocks.nextRenderedPage = {
      html: '',
      htmlByteLength: MAX_ARTICLE_IMPORT_HTML_BYTES + 1,
      text: '正文',
      title: 'Article',
      url: 'https://example.com/post',
    };

    await expect(articleRecordFromUrl('https://example.com/post')).rejects.toThrow(
      'ARTICLE_IMPORT_RESPONSE_TOO_LARGE',
    );

    expect(workerMocks.instances).toHaveLength(0);
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

  it('loads challenge pages in an isolated temporary browser session', async () => {
    const article = articleRecord();
    workerMocks.MockWorker.nextMessage = { ok: true, article };
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>cf-browser-verification</html>'),
    );

    await expect(articleRecordFromUrl('https://example.com/post')).resolves.toEqual(article);

    expect(browserWindowMocks.instances).toHaveLength(1);
    const browserWindow = browserWindowMocks.instances[0];
    const partition = browserWindow.options.webPreferences?.partition;
    expect(partition).toMatch(/^yomitomo-import-/);
    expect(partition?.startsWith('persist:')).toBe(false);
    expect(browserWindow.options.webPreferences?.sandbox).toBe(true);
    expect(browserWindow.destroyed).toBe(true);
    expect(browserWindow.webContents.session.clearStorageData).toHaveBeenCalledOnce();
    expect(browserWindow.webContents.session.clearCache).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalledWith(
      '[article-import] rendered import session',
      expect.objectContaining({
        host: 'example.com',
        persistent: false,
      }),
    );
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
