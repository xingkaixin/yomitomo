// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popup } from '../popup-view';

const { tabsQuery, toggleReaderInTab } = vi.hoisted(() => ({
  tabsQuery: vi.fn(),
  toggleReaderInTab: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      query: tabsQuery,
    },
  },
}));

vi.mock('../popup-actions', () => ({
  toggleReaderInTab,
}));

beforeEach(() => {
  tabsQuery.mockResolvedValue([{ id: 123 }]);
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

  it('uses a single ellipsis glyph while opening the reader', async () => {
    let resolveToggle: () => void = () => {};
    toggleReaderInTab.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveToggle = resolve;
      }),
    );
    render(<Popup />);

    fireEvent.click(screen.getByRole('button', { name: '进入阅读器模式' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('正在打开阅读器…');
    });
    resolveToggle();
    await waitFor(() => expect(window.close).toHaveBeenCalled());
  });
});
