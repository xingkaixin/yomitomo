import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArticleInTab, getArticlePreviewInTab, toggleReaderInTab } from '../popup-actions';

const { sendMessage, executeScript } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  executeScript: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    scripting: {
      executeScript,
    },
    tabs: {
      sendMessage,
    },
  },
}));

beforeEach(() => {
  sendMessage.mockResolvedValue(undefined);
  executeScript.mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe('toggleReaderInTab', () => {
  it('uses the manifest content script listener when it is already available', async () => {
    await toggleReaderInTab(123);

    expect(sendMessage).toHaveBeenCalledWith(123, { type: 'yomitomo:toggle' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('injects the content script when the tab has no listener yet', async () => {
    sendMessage
      .mockRejectedValueOnce(
        new Error('Could not establish connection. Receiving end does not exist.'),
      )
      .mockResolvedValueOnce({ ok: true });

    await toggleReaderInTab(123);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 123 },
      files: ['content-scripts/content.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('surfaces content script toggle errors', async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: 'extract failed' });

    await expect(toggleReaderInTab(123)).rejects.toThrow('extract failed');
  });

  it('loads article preview through the content script', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      article: {
        id: 'article-1',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        title: '文章标题',
        domain: 'example.com',
        wordCount: 1200,
        readingMinutes: 5,
        readerActive: false,
      },
    });

    await expect(getArticlePreviewInTab(123)).resolves.toEqual({
      id: 'article-1',
      url: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      title: '文章标题',
      domain: 'example.com',
      wordCount: 1200,
      readingMinutes: 5,
      readerActive: false,
    });
    expect(sendMessage).toHaveBeenCalledWith(123, { type: 'yomitomo:article-preview' });
  });

  it('loads the extracted article through the content script', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      article: {
        id: 'article-1',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        title: '文章标题',
        content: '<p>正文</p>',
        contentHash: 'hash-1',
      },
    });

    await expect(getArticleInTab(123, { inlineImages: true })).resolves.toMatchObject({
      id: 'article-1',
      content: '<p>正文</p>',
    });
    expect(sendMessage).toHaveBeenCalledWith(123, {
      type: 'yomitomo:article',
      inlineImages: true,
    });
  });
});
