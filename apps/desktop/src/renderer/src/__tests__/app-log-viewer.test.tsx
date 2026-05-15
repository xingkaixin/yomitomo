// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../../app-update-types';
import { AboutSettings } from '../app-log-viewer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function installDesktopAboutApi() {
  const updateListeners: Array<(state: AppUpdateState) => void> = [];
  const desktop = {
    getAppInfo: vi.fn().mockResolvedValue({ desktopVersion: '0.1.0' }),
    getUpdateStatus: vi.fn().mockResolvedValue({
      status: 'idle',
      currentVersion: '0.1.0',
    } satisfies AppUpdateState),
    checkForUpdates: vi.fn().mockResolvedValue({
      status: 'not-available',
      currentVersion: '0.1.0',
      availableVersion: '0.1.0',
    } satisfies AppUpdateState),
    downloadUpdate: vi.fn().mockResolvedValue({
      status: 'downloaded',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
    } satisfies AppUpdateState),
    installUpdate: vi.fn().mockResolvedValue({
      status: 'downloaded',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
    } satisfies AppUpdateState),
    onUpdateStatus: vi.fn((callback: (state: AppUpdateState) => void) => {
      updateListeners.push(callback);
      return () => undefined;
    }),
    openUrl: vi.fn().mockResolvedValue(undefined),
    emitUpdate: (state: AppUpdateState) => {
      updateListeners.forEach((listener) => listener(state));
    },
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

  it('checks for updates from the version row', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings />);

    expect(await screen.findByText('可手动检查 GitHub Releases 上的新版本。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    await waitFor(() => expect(desktop.checkForUpdates).toHaveBeenCalledOnce());
    expect(await screen.findByText('当前已是最新版本。')).toBeTruthy();
  });

  it('downloads and installs an available update', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings />);
    await screen.findByText('可手动检查 GitHub Releases 上的新版本。');

    act(() => {
      desktop.emitUpdate({
        status: 'available',
        currentVersion: '0.1.0',
        availableVersion: '0.2.0',
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: /下载更新/ }));

    await waitFor(() => expect(desktop.downloadUpdate).toHaveBeenCalledOnce());
    fireEvent.click(await screen.findByRole('button', { name: /重启安装/ }));
    expect(desktop.installUpdate).toHaveBeenCalledOnce();
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
