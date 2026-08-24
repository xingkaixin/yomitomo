import type {
  AppLockSetEnabledInput,
  AppLockSetShortcutInput,
  AppLockVerifyPinResult,
} from '../../ipc-contract';
import { rendererStoreForAppLockState } from '../../app-store';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import {
  resetAppLockPinAttempts,
  verifyAppLockPinAttempt,
  type AppLockPinAttemptResult,
} from '../app-lock/app-lock-attempt-policy';
import { deleteAppLockPin, hasAppLockPin, saveAppLockPin } from '../app-lock/app-lock-secrets';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

type AppLockIpcContext = Pick<DesktopMainIpcContext, 'sendFullStoreUpdated'> & {
  getPersistenceModules: () => Promise<{
    storeSettings: Pick<
      typeof import('../store/store-settings'),
      'readAppLockSettings' | 'saveSettings'
    >;
    storeSnapshot: Pick<typeof import('../store/store-snapshot'), 'readStore'>;
  }>;
};

export function registerAppLockIpc(context: AppLockIpcContext) {
  handleDesktopIpc('appLock:getStatus', async () => readAppLockStatus(context));

  handleDesktopIpc('appLock:setPin', async (_event, input) => {
    if (input.pin !== input.confirmPin) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinMismatch);
    }
    await saveAppLockPin(input.pin);
    resetAppLockPinAttempts();
    return readAppLockStatus(context);
  });

  handleDesktopIpc('appLock:verifyPin', async (_event, input) =>
    appLockVerifyPinResult(await verifyAppLockPinAttempt(input.pin)),
  );

  handleDesktopIpc('appLock:unlock', async (event, input) => {
    const { storeSettings, storeSnapshot } = await context.getPersistenceModules();
    const settings = storeSettings.readAppLockSettings();
    if (!settings.appLockEnabled) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockDisabled);
    }
    if (!(await hasAppLockPin())) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinRequired);
    }
    const verification = await verifyAppLockPinAttempt(input.pin);
    if (verification.status !== 'verified') throw appLockPinAttemptError(verification);
    if (!settings.appLockLocked) return storeSnapshot.readStore();

    const nextStore = await storeSettings.saveSettings({ appLockLocked: false });
    context.sendFullStoreUpdated(event, nextStore);
    return nextStore;
  });

  handleDesktopIpc('appLock:setLocked', async (event, input) => {
    if (!input.locked) throw new DesktopIpcError(desktopIpcErrorCodes.appLockUnlockRequired);
    const { storeSettings } = await context.getPersistenceModules();
    const settings = storeSettings.readAppLockSettings();
    if (input.locked && !settings.appLockEnabled) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockDisabled);
    }
    if (input.locked && !(await hasAppLockPin())) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinRequired);
    }
    const nextStore = rendererStoreForAppLockState(
      await storeSettings.saveSettings({ appLockLocked: input.locked }),
    );
    context.sendFullStoreUpdated(event, nextStore);
    return nextStore;
  });

  handleDesktopIpc('appLock:setEnabled', async (event, input) => {
    await assertCanSetAppLockEnabled(input);
    const { storeSettings } = await context.getPersistenceModules();
    const store = await storeSettings.saveSettings({
      appLockEnabled: input.enabled,
      appLockLockOnStartup: input.enabled ? undefined : false,
      appLockLocked: input.enabled ? undefined : false,
    });
    if (!input.enabled) {
      await deleteAppLockPin();
      resetAppLockPinAttempts();
    }
    context.sendFullStoreUpdated(event, store);
    return store;
  });

  handleDesktopIpc('appLock:setShortcut', async (event, input) => {
    const { storeSettings } = await context.getPersistenceModules();
    const store = await storeSettings.saveSettings({
      appLockShortcut: normalizeShortcutInput(input),
    });
    context.sendFullStoreUpdated(event, store);
    return store;
  });
}

async function readAppLockStatus(context: AppLockIpcContext) {
  const { storeSettings } = await context.getPersistenceModules();
  const settings = storeSettings.readAppLockSettings();
  return {
    configured: await hasAppLockPin(),
    enabled: settings.appLockEnabled,
    locked: settings.appLockLocked,
    shortcut: settings.appLockShortcut,
  };
}

async function assertCanSetAppLockEnabled(input: AppLockSetEnabledInput) {
  if (input.enabled) {
    if (!(await hasAppLockPin())) {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinRequired);
    }
    return;
  }

  if (!input.pin) throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinInvalid);
  const verification = await verifyAppLockPinAttempt(input.pin);
  if (verification.status !== 'verified') throw appLockPinAttemptError(verification);
}

function appLockVerifyPinResult(result: AppLockPinAttemptResult): AppLockVerifyPinResult {
  if (result.status === 'verified') return { ok: true, retryAfterMs: 0, status: 'verified' };
  return { ok: false, retryAfterMs: result.retryAfterMs, status: result.status };
}

function appLockPinAttemptError(result: Exclude<AppLockPinAttemptResult, { status: 'verified' }>) {
  const code =
    result.status === 'blocked'
      ? desktopIpcErrorCodes.appLockRateLimited
      : desktopIpcErrorCodes.appLockPinInvalid;
  return new DesktopIpcError(code, code, { detail: { retryAfterMs: result.retryAfterMs } });
}

function normalizeShortcutInput(input: AppLockSetShortcutInput) {
  return input.shortcut?.trim() || undefined;
}
