import { describe, expect, it, vi } from 'vitest';
import { createDataManagementActions } from '../settings/app-data-management-actions';
import { createAppSettingsActions } from '../settings/app-settings-actions';

type SettingsDesktop = ReturnType<Parameters<typeof createAppSettingsActions>[0]>;
type DataManagementDesktop = ReturnType<Parameters<typeof createDataManagementActions>[0]>;

describe('app settings actions', () => {
  it('enables app lock only after saving the new PIN', async () => {
    const setAppLockPin = vi.fn().mockResolvedValue(undefined);
    const setAppLockEnabled = vi.fn().mockResolvedValue({ settings: { appLockEnabled: true } });
    const actions = createAppSettingsActions(
      () => ({ setAppLockPin, setAppLockEnabled }) as unknown as SettingsDesktop,
    );

    await expect(actions.enableAppLock('123456', '123456')).resolves.toEqual({
      settings: { appLockEnabled: true },
    });
    expect(setAppLockPin).toHaveBeenCalledWith({ pin: '123456', confirmPin: '123456' });
    expect(setAppLockEnabled).toHaveBeenCalledWith({ enabled: true });
    expect(setAppLockPin.mock.invocationCallOrder[0]).toBeLessThan(
      setAppLockEnabled.mock.invocationCallOrder[0],
    );
  });

  it('refreshes WeRead state after testing the connection', async () => {
    const testWeRead = vi.fn().mockResolvedValue({ ok: true });
    const getWeReadState = vi.fn().mockResolvedValue({ settings: { configured: true } });
    const actions = createAppSettingsActions(
      () => ({ testWeRead, getWeReadState }) as unknown as SettingsDesktop,
    );

    await expect(actions.testWeReadAndRefresh('api-key')).resolves.toEqual({
      result: { ok: true },
      state: { settings: { configured: true } },
    });
    expect(testWeRead).toHaveBeenCalledWith('api-key');
    expect(getWeReadState).toHaveBeenCalledOnce();
  });
});

describe('data management actions', () => {
  it('persists log retention without mutating the current settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue({ settings: { logRetentionDays: 30 } });
    const actions = createDataManagementActions(
      () => ({ saveSettings }) as unknown as DataManagementDesktop,
    );
    const settings = { themeId: 'paper-white' as const };

    await actions.saveLogRetention(settings, 30);

    expect(saveSettings).toHaveBeenCalledWith({ themeId: 'paper-white', logRetentionDays: 30 });
    expect(settings).toEqual({ themeId: 'paper-white' });
  });
});
