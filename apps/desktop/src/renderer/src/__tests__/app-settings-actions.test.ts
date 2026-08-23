import { describe, expect, it, vi } from 'vitest';
import { createDataManagementActions } from '../settings/app-data-management-actions';
import { createAppSettingsActions } from '../settings/app-settings-actions';

type SettingsDesktop = ReturnType<Parameters<typeof createAppSettingsActions>[0]>;
type DataManagementDesktop = ReturnType<Parameters<typeof createDataManagementActions>[0]>;

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

describe('data management actions', () => {
  it('persists only the log retention patch', async () => {
    const saveSettings = vi.fn().mockResolvedValue({ settings: { logRetentionDays: 30 } });
    const actions = createDataManagementActions(
      () => ({ store: { saveSettings } }) as unknown as DataManagementDesktop,
    );
    await actions.saveLogRetention(30);

    expect(saveSettings).toHaveBeenCalledWith({ logRetentionDays: 30 });
  });
});
