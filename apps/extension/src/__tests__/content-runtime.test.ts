import { describe, expect, it, vi } from 'vitest';
import { registerContentToggleListener } from '../content-runtime';

describe('registerContentToggleListener', () => {
  it('registers one toggle listener per window', () => {
    const listeners: Array<(message: { type?: string }) => unknown> = [];
    const targetWindow = {} as Window;

    const first = registerContentToggleListener({
      addListener: (listener) => listeners.push(listener),
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });
    const second = registerContentToggleListener({
      addListener: (listener) => listeners.push(listener),
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(listeners).toHaveLength(1);
  });

  it('toggles only for yomitomo messages', async () => {
    const toggleReader = vi.fn().mockResolvedValue(undefined);
    let listener: ((message: { type?: string }) => Promise<unknown> | undefined) | undefined;

    registerContentToggleListener({
      addListener: (nextListener) => {
        listener = nextListener;
      },
      targetWindow: {} as Window,
      toggleReader,
      errorMessage: String,
    });

    expect(listener?.({ type: 'other' })).toBeUndefined();
    await expect(listener?.({ type: 'yomitomo:toggle' })).resolves.toEqual({ ok: true });
    await expect(listener?.({ type: 'yomitomo:toggle:v2' })).resolves.toEqual({ ok: true });
    expect(toggleReader).toHaveBeenCalledTimes(2);
  });

  it('returns article preview for popup inspection', async () => {
    let listener: ((message: { type?: string }) => Promise<unknown> | undefined) | undefined;

    registerContentToggleListener({
      addListener: (nextListener) => {
        listener = nextListener;
      },
      targetWindow: {} as Window,
      getArticlePreview: vi.fn().mockResolvedValue({
        id: 'article-1',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        title: '文章标题',
        domain: 'example.com',
        wordCount: 1200,
        readingMinutes: 5,
      }),
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    await expect(listener?.({ type: 'yomitomo:article-preview' })).resolves.toEqual({
      ok: true,
      article: {
        id: 'article-1',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        title: '文章标题',
        domain: 'example.com',
        wordCount: 1200,
        readingMinutes: 5,
      },
    });
  });

  it('surfaces article preview errors', async () => {
    let listener: ((message: { type?: string }) => Promise<unknown> | undefined) | undefined;

    registerContentToggleListener({
      addListener: (nextListener) => {
        listener = nextListener;
      },
      targetWindow: {} as Window,
      getArticlePreview: vi.fn().mockRejectedValue(new Error('preview failed')),
      toggleReader: vi.fn(),
      errorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    });

    await expect(listener?.({ type: 'yomitomo:article-preview' })).resolves.toEqual({
      ok: false,
      error: 'preview failed',
    });
  });

  it('returns extracted article content for popup submission', async () => {
    let listener:
      | ((message: { type?: string; inlineImages?: boolean }) => Promise<unknown> | undefined)
      | undefined;
    const article = {
      id: 'article-1',
      url: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      title: '文章标题',
      content: '<p>正文</p>',
      contentHash: 'hash-1',
    };
    const getArticle = vi.fn().mockResolvedValue(article);

    registerContentToggleListener({
      addListener: (nextListener) => {
        listener = nextListener;
      },
      targetWindow: {} as Window,
      getArticle,
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    await expect(listener?.({ type: 'yomitomo:article', inlineImages: true })).resolves.toEqual({
      ok: true,
      article,
    });
    expect(getArticle).toHaveBeenCalledWith({ inlineImages: true });
  });

  it('marks the window ready only after listener registration succeeds', () => {
    const listeners: Array<(message: { type?: string }) => unknown> = [];
    const targetWindow = {} as Window;

    expect(() =>
      registerContentToggleListener({
        addListener: () => {
          throw new TypeError('Illegal invocation');
        },
        targetWindow,
        toggleReader: vi.fn(),
        errorMessage: String,
      }),
    ).toThrow('Illegal invocation');

    const registered = registerContentToggleListener({
      addListener: (listener) => listeners.push(listener),
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    expect(registered).toBe(true);
    expect(listeners).toHaveLength(1);
  });

  it('leaves the window unready when the extension context is gone', () => {
    const targetWindow = {} as Window;

    const registered = registerContentToggleListener({
      addListener: () => false,
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    expect(registered).toBe(false);
    expect(
      registerContentToggleListener({
        addListener: () => true,
        targetWindow,
        toggleReader: vi.fn(),
        errorMessage: String,
      }),
    ).toBe(true);
  });
});
