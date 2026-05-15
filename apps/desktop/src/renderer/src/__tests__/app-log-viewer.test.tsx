// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutSettings } from '../app-log-viewer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function installDesktopAboutApi() {
  const desktop = {
    getAppInfo: vi.fn().mockResolvedValue({ desktopVersion: '0.1.0' }),
    openUrl: vi.fn().mockResolvedValue(undefined),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe('AboutSettings', () => {
  it('shows the desktop version', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    expect(await screen.findByText('v0.1.0')).toBeTruthy();
    expect(screen.getByText('开源许可证')).toBeTruthy();
    expect(screen.getByText(/Yomitomo 使用 MIT/)).toBeTruthy();
  });

  it('opens project links through the desktop bridge', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /打开文档/ }));

    await waitFor(() =>
      expect(desktop.openUrl).toHaveBeenCalledWith('https://github.com/xingkaixin/yomitomo#readme'),
    );
  });

  it('filters open source packages in the license dialog', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /查看许可证/ }));
    expect(screen.getByRole('dialog', { name: '开源许可证' })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索软件包或许可证...'), {
      target: { value: 'readability' },
    });

    expect(screen.getByText('@mozilla/readability')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /@mozilla\/readability/ }));
    expect(screen.getAllByText('Apache-2.0').length).toBeGreaterThan(0);
  });

  it('includes vendored foliate-js in the license dialog', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /查看许可证/ }));
    fireEvent.change(screen.getByPlaceholderText('搜索软件包或许可证...'), {
      target: { value: 'foliate' },
    });

    expect(screen.getByText('foliate-js')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /foliate-js/ }));
    expect(screen.getAllByText('MIT').length).toBeGreaterThan(0);
  });
});
