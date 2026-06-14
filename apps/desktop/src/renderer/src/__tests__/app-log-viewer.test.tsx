// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../../app-update-types';
import { AboutSettings } from '../shell/app-log-viewer';
import { initializeAppI18n } from '../i18n/app-i18n';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

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
    saveSettings: vi.fn().mockImplementation((settings) =>
      Promise.resolve({
        user: {
          id: 'user_local',
          nickname: '我',
          username: 'me',
          avatar: '',
          annotationColor: '#f4c95d',
          updatedAt: '',
        },
        settings,
        providers: [],
        agents: [],
        articles: [],
      }),
    ),
    getAgentRuntimeTracePath: vi.fn().mockResolvedValue('/tmp/yomitomo-agent-trace.jsonl'),
    listAgentRuntimeTraces: vi.fn().mockResolvedValue([
      {
        id: 'trace_1',
        at: '2026-05-26T00:00:00.000Z',
        taskType: 'selection_first',
        agentId: 'agent_1',
        articleId: 'article_1',
        status: 'result',
        finalActionType: 'add_annotation',
        stepCount: 2,
        repairUsed: false,
        annotationCount: 1,
        trace: { steps: [] },
      },
    ]),
    clearAgentRuntimeTraces: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByRole('button', { name: /Yomitomo 使用 MIT/ })).toBeTruthy();
  });

  it('checks for updates from the version row', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings />);

    expect(await screen.findByLabelText('可手动检查新版本。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));

    await waitFor(() => expect(desktop.checkForUpdates).toHaveBeenCalledOnce());
    expect(await screen.findByLabelText('当前已是最新版本。')).toBeTruthy();
  });

  it('downloads and installs an available update', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings />);
    await screen.findByLabelText('可手动检查新版本。');

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

  it('opens localized website links through the desktop bridge', async () => {
    const desktop = installDesktopAboutApi();

    render(<AboutSettings settings={{ uiLanguage: 'zh-CN' }} />);

    fireEvent.click(screen.getByRole('button', { name: /查看更新记录/ }));

    await waitFor(() =>
      expect(desktop.openUrl).toHaveBeenCalledWith('https://yomitomo.app/changelogs/'),
    );

    fireEvent.click(screen.getByRole('button', { name: /打开 GitHub/ }));

    await waitFor(() =>
      expect(desktop.openUrl).toHaveBeenCalledWith('https://github.com/xingkaixin/yomitomo'),
    );

    fireEvent.click(screen.getByRole('button', { name: /打开官网/ }));

    await waitFor(() => expect(desktop.openUrl).toHaveBeenCalledWith('https://yomitomo.app/'));
  });

  it('opens English website links when English is selected', async () => {
    const desktop = installDesktopAboutApi();

    initializeAppI18n('en');
    render(<AboutSettings settings={{ uiLanguage: 'en' }} />);

    fireEvent.click(screen.getByRole('button', { name: /View release notes/ }));

    await waitFor(() =>
      expect(desktop.openUrl).toHaveBeenCalledWith('https://yomitomo.app/en/changelogs/'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Open website/ }));

    await waitFor(() => expect(desktop.openUrl).toHaveBeenCalledWith('https://yomitomo.app/en/'));
  });

  it('uses a local action icon for the license dialog row', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    const licenseButton = screen.getByRole('button', { name: /查看许可证/ });

    expect(licenseButton.querySelector('.lucide-chevron-right')).toBeTruthy();
    expect(licenseButton.querySelector('.lucide-external-link')).toBeNull();
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

  it('closes the license dialog from the close button', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /查看许可证/ }));
    expect(screen.getByRole('dialog', { name: '开源许可证' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '关闭开源许可证' }));

    expect(screen.queryByRole('dialog', { name: '开源许可证' })).toBeNull();
  });

  it('closes the license dialog on Escape', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /查看许可证/ }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: '开源许可证' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '开源许可证' })).toBeNull();
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

  it('includes bundled font notices in the license dialog', async () => {
    installDesktopAboutApi();

    render(<AboutSettings />);

    fireEvent.click(screen.getByRole('button', { name: /查看许可证/ }));
    fireEvent.change(screen.getByPlaceholderText('搜索软件包或许可证...'), {
      target: { value: 'JetBrains Mono' },
    });

    expect(screen.getByText('JetBrains Mono')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /JetBrains Mono/ }));
    expect(screen.getAllByText('OFL-1.1').length).toBeGreaterThan(0);
  });

  it('saves developer mode from the about panel', async () => {
    const desktop = installDesktopAboutApi();
    const onStoreUpdated = vi.fn();

    render(<AboutSettings settings={{}} onStoreUpdated={onStoreUpdated} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /开发者模式/ }));

    await waitFor(() =>
      expect(desktop.saveSettings).toHaveBeenCalledWith({ developerModeEnabled: true }),
    );
    expect(onStoreUpdated).toHaveBeenCalledOnce();
  });

  it('does not show the legacy agent trace block in developer mode', () => {
    installDesktopAboutApi();

    render(<AboutSettings settings={{ developerModeEnabled: true }} />);

    expect(screen.queryByText('Agent Trace')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /开发者模式/ })).toBeTruthy();
  });
});
