// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataManagementSettings } from '../settings/app-settings-panels';
import { emptyStore } from '../settings/app-settings';
import { initializeAppI18n } from '../i18n/app-i18n';
import { appToast } from '../shell/app-toast';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

vi.mock('../shell/app-toast', () => ({
  appToast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const localStorageStore: Record<string, string> = {};

Object.defineProperty(window, 'localStorage', {
  value: {
    clear: () => {
      for (const key of Object.keys(localStorageStore)) delete localStorageStore[key];
    },
    getItem: (key: string) => localStorageStore[key] ?? null,
    removeItem: (key: string) => {
      delete localStorageStore[key];
    },
    setItem: (key: string, value: string) => {
      localStorageStore[key] = value;
    },
  },
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

function installDesktopDataApi() {
  const retainedStore = { ...emptyStore, settings: { logRetentionDays: 15 } };
  const restoredStore = { ...emptyStore, settings: { logRetentionDays: 90 } };
  const desktop = {
    getDataManagementPaths: vi.fn().mockResolvedValue({
      dataDir: '/tmp/yomitomo',
      logFile: '/tmp/yomitomo/yomitomo-agent.log',
      databaseFile: '/tmp/yomitomo/yomitomo.sqlite',
    }),
    openDataManagementPath: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(retainedStore),
    clearLog: vi.fn().mockResolvedValue(undefined),
    backupDatabase: vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/tmp/yomitomo-backup.sqlite',
    }),
    restoreDatabase: vi.fn().mockResolvedValue({
      canceled: false,
      backupPath: '/tmp/yomitomo/backups/yomitomo-before-restore.sqlite',
      store: restoredStore,
    }),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      data: {
        backupDatabase: desktop.backupDatabase,
        getPaths: desktop.getDataManagementPaths,
        openPath: desktop.openDataManagementPath,
        restoreDatabase: desktop.restoreDatabase,
      },
      diagnostics: {
        log: {
          clear: desktop.clearLog,
        },
      },
      store: {
        saveSettings: desktop.saveSettings,
      },
    },
  });

  return desktop;
}

describe('DataManagementSettings', () => {
  it('shows data paths and opens the selected location', async () => {
    const desktop = installDesktopDataApi();

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    expect(await screen.findByText('/tmp/yomitomo/yomitomo.sqlite')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '打开数据库文件' }));

    await waitFor(() =>
      expect(desktop.openDataManagementPath).toHaveBeenCalledWith('databaseFile'),
    );
  });

  it('saves log retention without opening a log viewer', async () => {
    const desktop = installDesktopDataApi();
    const onStoreUpdated = vi.fn();

    render(
      <DataManagementSettings
        settings={{ onboardingCompletedAt: '2026-05-12T00:00:00.000Z' }}
        onStoreUpdated={onStoreUpdated}
      />,
    );

    expect(screen.queryByRole('button', { name: '永久' })).toBeNull();
    expect(screen.getByRole('button', { name: '90 天' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '15 天' }));

    await waitFor(() =>
      expect(desktop.saveSettings).toHaveBeenCalledWith({ logRetentionDays: 15 }),
    );
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ logRetentionDays: 15 }) }),
    );
    expect(screen.queryByRole('textbox', { name: /日志/ })).toBeNull();
  });

  it('retries failed log retention saves through the shared save state', async () => {
    const desktop = installDesktopDataApi();
    desktop.saveSettings
      .mockRejectedValueOnce(new Error('retention write failed'))
      .mockResolvedValueOnce({ ...emptyStore, settings: { logRetentionDays: 15 } });
    const onStoreUpdated = vi.fn();

    render(<DataManagementSettings settings={{}} onStoreUpdated={onStoreUpdated} />);

    fireEvent.click(screen.getByRole('button', { name: '15 天' }));

    const retentionAlert = await screen.findByRole('alert', { name: '保存状态' });
    expect(within(retentionAlert).getByText('retention write failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(desktop.saveSettings).toHaveBeenCalledTimes(2));
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ logRetentionDays: 15 }) }),
    );
    expect(await screen.findByText('已保存')).toBeTruthy();
  });

  it('backs up and restores the database through desktop actions', async () => {
    const desktop = installDesktopDataApi();
    const onStoreUpdated = vi.fn();

    render(
      <DataManagementSettings
        settings={{ logRetentionDays: 30 }}
        onStoreUpdated={onStoreUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '备份数据库' }));
    await waitFor(() => expect(desktop.backupDatabase).toHaveBeenCalledOnce());
    expect(appToast.success).toHaveBeenCalledWith('数据库备份完成', {
      description: '已保存到 /tmp/yomitomo-backup.sqlite',
    });

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    expect(screen.getByRole('dialog', { name: '从备份还原数据库？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(desktop.restoreDatabase).not.toHaveBeenCalled();
    expect(appToast.warning).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '从备份还原数据库？' })).getByRole('button', {
        name: '选择备份并还原',
      }),
    );
    await waitFor(() => expect(desktop.restoreDatabase).toHaveBeenCalledOnce());
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ logRetentionDays: 90 }) }),
    );
    expect(appToast.success).toHaveBeenCalledWith('数据库已还原', {
      description: '原数据库已备份到 /tmp/yomitomo/backups/yomitomo-before-restore.sqlite',
    });
  });

  it('shows warning toasts when database backup or restore is canceled', async () => {
    const desktop = installDesktopDataApi();
    desktop.backupDatabase.mockResolvedValueOnce({ canceled: true });
    desktop.restoreDatabase.mockResolvedValueOnce({ canceled: true });

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '备份数据库' }));
    await waitFor(() => expect(desktop.backupDatabase).toHaveBeenCalledOnce());
    expect(appToast.warning).toHaveBeenCalledWith('已取消数据库备份', {
      description: '未创建备份文件。',
    });

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '从备份还原数据库？' })).getByRole('button', {
        name: '选择备份并还原',
      }),
    );

    await waitFor(() => expect(desktop.restoreDatabase).toHaveBeenCalledOnce());
    expect(appToast.warning).toHaveBeenCalledWith('已取消数据库还原', {
      description: '当前数据库未发生变化。',
    });
  });

  it('shows error toasts when data management actions fail', async () => {
    const desktop = installDesktopDataApi();
    desktop.clearLog.mockRejectedValueOnce(new Error('DATA_MANAGEMENT_DATABASE_NOT_OPEN'));
    desktop.backupDatabase.mockRejectedValueOnce(
      new Error('DATA_MANAGEMENT_BACKUP_TARGET_IS_CURRENT_DATABASE'),
    );
    desktop.restoreDatabase.mockRejectedValueOnce(
      new Error('DATA_MANAGEMENT_RESTORE_SOURCE_IS_CURRENT_DATABASE'),
    );

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '清空日志文件' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '清空日志文件？' })).getByRole('button', {
        name: '清空日志文件',
      }),
    );
    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('日志文件未清空', {
        description: '本地数据库尚未打开。',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '备份数据库' }));
    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('数据库备份失败', {
        description: '不能把备份保存到当前数据库文件。',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '从备份还原数据库？' })).getByRole('button', {
        name: '选择备份并还原',
      }),
    );
    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('数据库还原失败', {
        description: '不能从当前数据库文件还原。',
      }),
    );
  });

  it('confirms before clearing the log file', async () => {
    const desktop = installDesktopDataApi();

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '清空日志文件' }));
    expect(screen.getByRole('dialog', { name: '清空日志文件？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(desktop.clearLog).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清空日志文件' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '清空日志文件？' })).getByRole('button', {
        name: '清空日志文件',
      }),
    );

    await waitFor(() => expect(desktop.clearLog).toHaveBeenCalledOnce());
    expect(appToast.success).toHaveBeenCalledWith('日志文件已清空', {
      description: '当前本机日志文件现在为空。',
    });
  });
});
