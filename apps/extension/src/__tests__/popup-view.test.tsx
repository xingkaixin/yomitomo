// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PAIRING_TOKEN_KEY } from '../desktop-bridge';
import { Popup } from '../popup-view';

const { storageGet, tabsQuery, toggleReaderInTab } = vi.hoisted(() => ({
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
  toggleReaderInTab,
}));

beforeEach(() => {
  storageGet.mockResolvedValue({});
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

  it('shows the saved pairing marker in the corner', async () => {
    storageGet.mockResolvedValue({ [DESKTOP_PAIRING_TOKEN_KEY]: 'token' });

    render(<Popup />);

    expect(await screen.findByLabelText('配对状态：已配对')).toBeTruthy();
  });

  it('shows the unpaired marker when no pairing token is saved', async () => {
    render(<Popup />);

    expect(await screen.findByLabelText('配对状态：未配对')).toBeTruthy();
  });

  it('uses a single ellipsis glyph while opening the reader', async () => {
    let resolveToggle: (() => void) | null = null;
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
    resolveToggle?.();
    await waitFor(() => expect(window.close).toHaveBeenCalled());
  });
});
