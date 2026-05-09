// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PAIRING_TOKEN_KEY } from '../desktop-bridge';
import { Popup } from '../popup-view';

const {
  connectPopupDesktop,
  desktopClose,
  desktopGetArticle,
  desktopSaveArticle,
  getArticleInTab,
  getArticlePreviewInTab,
  storageGet,
  tabsQuery,
  toggleReaderInTab,
} = vi.hoisted(() => ({
  connectPopupDesktop: vi.fn(),
  desktopClose: vi.fn(),
  desktopGetArticle: vi.fn(),
  desktopSaveArticle: vi.fn(),
  getArticleInTab: vi.fn(),
  getArticlePreviewInTab: vi.fn(),
  storageGet: vi.fn(),
  tabsQuery: vi.fn(),
  toggleReaderInTab: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      query: tabsQuery,
    },
    storage: {
      local: {
        get: storageGet,
      },
    },
  },
}));

vi.mock('../popup-actions', () => ({
  getArticleInTab,
  getArticlePreviewInTab,
  toggleReaderInTab,
}));

vi.mock('../popup-desktop', () => ({
  connectPopupDesktop,
}));

beforeEach(() => {
  getArticlePreviewInTab.mockResolvedValue({
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章标题',
    domain: 'example.com',
    wordCount: 1200,
    readingMinutes: 5,
  });
  getArticleInTab.mockResolvedValue({
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章标题',
    byline: '作者',
    excerpt: '摘要',
    siteName: 'Example',
    content: '<p>正文</p>',
    contentHash: 'hash-1',
  });
  desktopGetArticle.mockResolvedValue(null);
  desktopSaveArticle.mockImplementation(async (article) => article);
  connectPopupDesktop.mockResolvedValue({
    settings: {},
    getArticle: desktopGetArticle,
    saveArticle: desktopSaveArticle,
    close: desktopClose,
  });
  storageGet.mockResolvedValue({});
  tabsQuery.mockResolvedValue([{ id: 123, url: 'https://example.com/post' }]);
  toggleReaderInTab.mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Popup', () => {
  it('exposes async status updates to assistive technology', () => {
    render(<Popup />);

    expect(screen.getByRole('status').textContent).toBe('准备进入阅读器模式');
  });

  it('shows the connected marker when desktop auth succeeds', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });

    render(<Popup />);

    expect(await screen.findByLabelText('配对状态：已连接')).toBeTruthy();
  });

  it('shows the unpaired marker when no pairing token is saved', async () => {
    render(<Popup />);

    expect(await screen.findByLabelText('配对状态：未配对')).toBeTruthy();
  });

  it('shows article information when the current tab is readable', async () => {
    render(<Popup />);

    expect(await screen.findByText('文章标题')).toBeTruthy();
    expect(screen.getByText('example.com · 约 1,200 字 · 5 分钟')).toBeTruthy();
    expect(screen.getByRole('button', { name: '进入阅读器模式' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('shows the send button only when the paired desktop is connected and missing the article', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });

    render(<Popup />);

    expect(await screen.findByRole('button', { name: '发送到阅读库' })).toBeTruthy();
    expect(desktopGetArticle).toHaveBeenCalledWith({
      id: 'article-1',
      url: 'https://example.com/post',
      canonicalUrl: 'https://example.com/post',
    });
  });

  it('hides the send button when the article already exists in the desktop library', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });
    desktopGetArticle.mockResolvedValue({
      id: 'article-1',
      url: 'https://example.com/post',
      canonicalUrl: 'https://example.com/post',
      title: '文章标题',
      contentHash: 'hash-1',
      annotations: [],
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });

    render(<Popup />);

    expect(await screen.findByText('这篇文章已在阅读库')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '发送到阅读库' })).toBeNull();
  });

  it('hides the send button when no pairing token is saved', async () => {
    render(<Popup />);

    await screen.findByText('文章标题');

    expect(connectPopupDesktop).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '发送到阅读库' })).toBeNull();
  });

  it('submits a zero-annotation article and hides the button after completion', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });
    connectPopupDesktop.mockResolvedValue({
      settings: { saveArticleImages: true },
      getArticle: desktopGetArticle,
      saveArticle: desktopSaveArticle,
      close: desktopClose,
    });

    render(<Popup />);

    const sendButton = await screen.findByRole('button', { name: '发送到阅读库' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(sendButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: '已发送' })).toBeTruthy();
    expect(getArticleInTab).toHaveBeenCalledWith(123, { inlineImages: true });
    expect(desktopSaveArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'article-1',
        contentHtml: '<p>正文</p>',
        annotations: [],
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.queryByRole('button', { name: '已发送' })).toBeNull();
  });

  it('disables the reader button on browser isolated pages', async () => {
    tabsQuery.mockResolvedValue([{ id: 123, url: 'chrome-extension://abc/options.html' }]);

    render(<Popup />);

    expect(await screen.findByText('扩展页面由浏览器隔离')).toBeTruthy();
    expect(screen.getByRole('button', { name: '进入阅读器模式' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(getArticlePreviewInTab).not.toHaveBeenCalled();
  });

  it('uses a single ellipsis glyph while opening the reader', async () => {
    let resolveToggle: (() => void) | null = null;
    toggleReaderInTab.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveToggle = resolve;
      }),
    );
    render(<Popup />);

    await screen.findByText('文章标题');
    fireEvent.click(screen.getByRole('button', { name: '进入阅读器模式' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('正在打开阅读器…');
    });
    resolveToggle?.();
    await waitFor(() => expect(window.close).toHaveBeenCalled());
  });
});
