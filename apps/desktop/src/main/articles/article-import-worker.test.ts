import { afterEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  articleRecordFromExtractedArticle: vi.fn(),
  extractArticleFromDocument: vi.fn(),
}));

const imageMocks = vi.hoisted(() => ({
  inlineArticleFavicon: vi.fn(),
  inlineArticleImages: vi.fn(),
}));

const jsdomMocks = vi.hoisted(() => ({
  closeWindow: vi.fn(),
}));

vi.mock('@yomitomo/core/article-extraction', () => coreMocks);

vi.mock('@yomitomo/core/article-images', () => imageMocks);

vi.mock('jsdom', async () => {
  const actual = await vi.importActual<typeof import('jsdom')>('jsdom');

  class MockJSDOM extends actual.JSDOM {
    constructor(...args: ConstructorParameters<typeof actual.JSDOM>) {
      super(...args);
      const close = this.window.close.bind(this.window);
      this.window.close = () => {
        jsdomMocks.closeWindow();
        close();
      };
    }
  }

  return {
    ...actual,
    JSDOM: MockJSDOM,
  };
});

import { articleImportWorkerTestApi } from './article-import-worker';

describe('article import worker', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('posts the invalid import task error for invalid worker data', async () => {
    const port = { postMessage: vi.fn() };

    await articleImportWorkerTestApi.postArticleImportWorkerResult({ url: '' }, port);

    expect(port.postMessage).toHaveBeenCalledWith({
      ok: false,
      error: { message: 'ARTICLE_IMPORT_INVALID_TASK' },
    });
    expect(jsdomMocks.closeWindow).not.toHaveBeenCalled();
  });

  it('posts the extraction error message and closes the JSDOM window', async () => {
    const port = { postMessage: vi.fn() };
    coreMocks.extractArticleFromDocument.mockRejectedValue(new Error('正文抽取失败'));

    await articleImportWorkerTestApi.postArticleImportWorkerResult(validWorkerData(), port);

    expect(port.postMessage).toHaveBeenCalledWith({
      ok: false,
      error: { message: '正文抽取失败' },
    });
    expect(jsdomMocks.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('closes the JSDOM window after a successful import', async () => {
    const extractedArticle = article();
    const record = articleRecord();
    coreMocks.extractArticleFromDocument.mockResolvedValue(extractedArticle);
    imageMocks.inlineArticleFavicon.mockResolvedValue(extractedArticle);
    coreMocks.articleRecordFromExtractedArticle.mockReturnValue(record);

    await expect(
      articleImportWorkerTestApi.extractArticleRecord(validWorkerData()),
    ).resolves.toEqual(record);

    expect(imageMocks.inlineArticleFavicon).toHaveBeenCalledWith(
      extractedArticle,
      expect.any(Function),
    );
    expect(jsdomMocks.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('returns null for non-image and oversized image responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response('html', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        headers: {
          'content-length': '2000001',
          'content-type': 'image/png',
        },
      }),
    );

    await expect(fetchImageDataUrl()).resolves.toBeNull();
    await expect(fetchImageDataUrl()).resolves.toBeNull();
  });

  it('returns null when the image body exceeds the byte limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(2_000_001), {
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(fetchImageDataUrl()).resolves.toBeNull();
  });

  it('returns null when image fetching fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failed'));

    await expect(fetchImageDataUrl()).resolves.toBeNull();
  });

  it('returns null when image fetching times out', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal instanceof AbortSignal) {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }
        }),
    );

    const result = fetchImageDataUrl();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
  });
});

function validWorkerData() {
  return {
    html: '<html><body><article><p>正文</p></article></body></html>',
    inlineImages: false,
    url: 'https://example.com/post',
    userAgent: 'Yomitomo Test',
  };
}

function fetchImageDataUrl() {
  return articleImportWorkerTestApi.fetchArticleImageDataUrl(
    'https://cdn.example.com/image.png',
    'https://example.com/post',
    'Yomitomo Test',
  );
}

function article() {
  return {
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: 'Article',
    content: '<p>正文</p>',
    contentHash: 'hash-1',
  };
}

function articleRecord() {
  return {
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: 'Article',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
  };
}
