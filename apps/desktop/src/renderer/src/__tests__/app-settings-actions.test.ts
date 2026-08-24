import { describe, expect, it, vi } from 'vitest';
import { createAppSettingsActions } from '../settings/app-settings-actions';

type SettingsDesktop = ReturnType<Parameters<typeof createAppSettingsActions>[0]>;

describe('app settings actions', () => {
  it('enables app lock only after saving the new PIN', async () => {
    const setPin = vi.fn().mockResolvedValue(undefined);
    const setEnabled = vi.fn().mockResolvedValue({ settings: { appLockEnabled: true } });
    const actions = createAppSettingsActions(
      () => ({ appLock: { setPin, setEnabled } }) as unknown as SettingsDesktop,
    );

    await expect(actions.enableAppLock('123456', '123456')).resolves.toEqual({
      settings: { appLockEnabled: true },
    });
    expect(setPin).toHaveBeenCalledWith({ pin: '123456', confirmPin: '123456' });
    expect(setEnabled).toHaveBeenCalledWith({ enabled: true });
    expect(setPin.mock.invocationCallOrder[0]).toBeLessThan(setEnabled.mock.invocationCallOrder[0]);
  });

  it('refreshes WeRead state after testing the connection', async () => {
    const test = vi.fn().mockResolvedValue({ ok: true });
    const getState = vi.fn().mockResolvedValue({ settings: { configured: true } });
    const actions = createAppSettingsActions(
      () => ({ weRead: { test, getState } }) as unknown as SettingsDesktop,
    );

    await expect(actions.testWeReadAndRefresh('api-key')).resolves.toEqual({
      result: { ok: true },
      state: { settings: { configured: true } },
    });
    expect(test).toHaveBeenCalledWith('api-key');
    expect(getState).toHaveBeenCalledOnce();
  });
});
