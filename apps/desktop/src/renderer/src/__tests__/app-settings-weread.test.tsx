// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeReadSettingsPanel } from '../settings/app-settings-panels';
import { initializeAppI18n } from '../i18n/app-i18n';

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

describe('WeReadSettingsPanel', () => {
  it('reveals a stored api key after explicit user action', async () => {
    const readWeReadApiKey = vi.fn().mockResolvedValue('wrk-stored');
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: vi.fn().mockResolvedValue({
            settings: { configured: true, openMethod: 'deeplink' },
            books: [],
          }),
          readApiKey: readWeReadApiKey,
        },
      },
    });

    render(<WeReadSettingsPanel />);

    const apiKeyInput = (await screen.findByLabelText('API Key')) as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));

    await waitFor(() => expect(apiKeyInput.value).toBe('wrk-stored'));
    expect(apiKeyInput.type).toBe('text');
    expect(readWeReadApiKey).toHaveBeenCalledOnce();
  });

  it('confirms before deleting the stored api key', async () => {
    const saveWeReadSettings = vi.fn().mockResolvedValue({
      settings: { configured: false, openMethod: 'deeplink' },
      books: [],
    });
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: vi.fn().mockResolvedValue({
            settings: { configured: true, openMethod: 'deeplink' },
            books: [],
          }),
          saveSettings: saveWeReadSettings,
        },
      },
    });

    render(<WeReadSettingsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '删除已保存 Key' }));
    expect(screen.getByRole('dialog', { name: '删除微信读书 API Key？' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '删除微信读书 API Key？' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: '删除微信读书 API Key？' })).toBeNull();
    expect(saveWeReadSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除已保存 Key' }));
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(saveWeReadSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除已保存 Key' }));
    const dialog = screen.getByRole('dialog', { name: '删除微信读书 API Key？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除已保存 Key' }));

    await waitFor(() =>
      expect(saveWeReadSettings).toHaveBeenCalledWith({
        removeApiKey: true,
        openMethod: 'deeplink',
      }),
    );
  });

  it('saves the WeRead sync mode independently', async () => {
    const saveWeReadSettings = vi.fn().mockResolvedValue({
      settings: { configured: true, openMethod: 'deeplink', syncMode: 'auto' },
      books: [],
    });
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: vi.fn().mockResolvedValue({
            settings: { configured: true, openMethod: 'deeplink', syncMode: 'manual' },
            books: [],
          }),
          saveSettings: saveWeReadSettings,
        },
      },
    });

    render(<WeReadSettingsPanel />);

    fireEvent.click(await screen.findByRole('radio', { name: /自动/ }));

    await waitFor(() =>
      expect(saveWeReadSettings).toHaveBeenCalledWith({
        syncMode: 'auto',
      }),
    );
    expect(await screen.findByText('已保存')).toBeTruthy();
  });

  it('rolls back failed WeRead sync mode saves and shows the shared error state', async () => {
    const saveWeReadSettings = vi.fn().mockRejectedValue(new Error('sync write failed'));
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: vi.fn().mockResolvedValue({
            settings: { configured: true, openMethod: 'deeplink', syncMode: 'manual' },
            books: [],
          }),
          saveSettings: saveWeReadSettings,
        },
      },
    });

    render(<WeReadSettingsPanel />);

    fireEvent.click(await screen.findByRole('radio', { name: /自动/ }));

    expect(await screen.findByText('保存失败：sync write failed')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /手动/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('clears pending WeRead save-state timers on unmount', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const saveWeReadSettings = vi.fn().mockResolvedValue({
      settings: { configured: true, openMethod: 'deeplink', syncMode: 'auto' },
      books: [],
    });

    try {
      Object.defineProperty(window, 'yomitomoDesktop', {
        configurable: true,
        value: {
          weRead: {
            getState: vi.fn().mockResolvedValue({
              settings: { configured: true, openMethod: 'deeplink', syncMode: 'manual' },
              books: [],
            }),
            saveSettings: saveWeReadSettings,
          },
        },
      });

      const view = render(<WeReadSettingsPanel />);

      fireEvent.click(await screen.findByRole('radio', { name: /自动/ }));

      await waitFor(() =>
        expect(saveWeReadSettings).toHaveBeenCalledWith({
          syncMode: 'auto',
        }),
      );

      const resetTimerCount = setTimeoutSpy.mock.calls.filter((call) => call[1] === 1200).length;
      const clearCallsBeforeUnmount = clearTimeoutSpy.mock.calls.length;

      view.unmount();

      expect(resetTimerCount).toBe(1);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(clearCallsBeforeUnmount + resetTimerCount);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });
});
