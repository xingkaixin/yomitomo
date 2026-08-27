// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeReadState } from '../../../ipc-contract';
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

  it.each(['unchanged', 'edited'] as const)(
    'applies saved credentials to an %s draft',
    async (draft) => {
      const saving = deferred<WeReadState>();
      const saveSettings = vi.fn(() => saving.promise);
      Object.defineProperty(window, 'yomitomoDesktop', {
        configurable: true,
        value: {
          weRead: {
            getState: async () => ({
              settings: { configured: false, openMethod: 'deeplink', syncMode: 'manual' },
              books: [],
            }),
            saveSettings,
          },
        },
      });
      await act(async () => {
        render(<WeReadSettingsPanel />);
      });
      const input = screen.getByLabelText('API Key') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'test-key-a' } });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: 'test-key-a', openMethod: 'deeplink' });
      if (draft === 'edited') fireEvent.change(input, { target: { value: 'test-key-b' } });

      await act(async () => {
        saving.resolve({
          settings: { configured: true, openMethod: 'deeplink', syncMode: 'manual' },
          books: [],
        });
        await saving.promise;
      });

      expect(
        (screen.getByRole('button', { name: '删除已保存 Key' }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(input.value).toBe(draft === 'edited' ? 'test-key-b' : '');
      expect(
        screen.getByRole('button', { name: draft === 'edited' ? '保存' : '已保存' }),
      ).toBeTruthy();
    },
  );

  it('applies credential removal while preserving a newly entered key', async () => {
    const removing = deferred<WeReadState>();
    const saveSettings = vi.fn(() => removing.promise);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: async () => ({
            settings: { configured: true, openMethod: 'deeplink', syncMode: 'manual' },
            books: [],
          }),
          saveSettings,
        },
      },
    });
    await act(async () => {
      render(<WeReadSettingsPanel />);
    });
    fireEvent.click(screen.getByRole('button', { name: '删除已保存 Key' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '删除已保存 Key' }),
    );
    expect(saveSettings).toHaveBeenCalledWith({ removeApiKey: true, openMethod: 'deeplink' });
    const input = screen.getByLabelText('API Key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test-key-next' } });

    await act(async () => {
      removing.resolve({
        settings: { configured: false, openMethod: 'deeplink', syncMode: 'manual' },
        books: [],
      });
      await removing.promise;
    });

    expect(
      (screen.getByRole('button', { name: '删除已保存 Key' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(input.value).toBe('test-key-next');
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('retains the draft and unconfigured state after a failed credential save', async () => {
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        weRead: {
          getState: async () => ({
            settings: { configured: false, openMethod: 'deeplink' },
            books: [],
          }),
          saveSettings: vi.fn().mockRejectedValue(new Error('keyring unavailable')),
        },
      },
    });
    await act(async () => {
      render(<WeReadSettingsPanel />);
    });
    const input = screen.getByLabelText('API Key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('保存失败：keyring unavailable')).toBeTruthy();
    expect(input.value).toBe('test-key');
    expect(
      (screen.getByRole('button', { name: '删除已保存 Key' }) as HTMLButtonElement).disabled,
    ).toBe(true);
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
