// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PAIRING_TOKEN_KEY } from '../desktop-bridge';
import { Popup } from '../popup-view';

const { getArticlePreviewInTab, storageGet, tabsQuery, toggleReaderInTab } = vi.hoisted(() => ({
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
  getArticlePreviewInTab,
  toggleReaderInTab,
}));

beforeEach(() => {
  getArticlePreviewInTab.mockResolvedValue({
    title: '文章标题',
    domain: 'example.com',
    wordCount: 1200,
    readingMinutes: 5,
  });
  storageGet.mockResolvedValue({});
  tabsQuery.mockResolvedValue([{ id: 123, url: 'https://example.com/post' }]);
  toggleReaderInTab.mockResolvedValue(undefined);
  vi.spyOn(window, 'close').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Popup', () => {
  it('exposes async status updates to assistive technology', () => {
    render(<Popup />);

    expect(screen.getByRole('status').textContent).toBe('准备进入阅读器模式');
  });

  it('shows the saved pairing marker in the corner', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });

    render(<Popup />);

    expect(await screen.findByLabelText('配对状态：已配对')).toBeTruthy();
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
