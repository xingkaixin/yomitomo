import type { AppLockSetEnabledInput, AppLockSetShortcutInput } from '../../ipc-contract';
import { DesktopIpcError } from '../../ipc-errors';
import {
  deleteAppLockPin,
  hasAppLockPin,
  saveAppLockPin,
  verifyAppLockPin,
} from '../app-lock/app-lock-secrets';
import type { DesktopMainIpcContext, DesktopPersistenceModule } from './ipc';
import { handleDesktopIpc } from './ipc';
import { rendererStoreForAppLockState } from './app-lock-renderer-store';

type AppLockIpcContext = Pick<DesktopMainIpcContext, 'sendFullStoreUpdated'> & {
  getPersistenceModule: () => Promise<{
    settingsPersistence: Pick<
      DesktopPersistenceModule['settingsPersistence'],
      'readStore' | 'saveSettings'
    >;
  }>;
};

export function registerAppLockIpc(context: AppLockIpcContext) {
  handleDesktopIpc('appLock:getStatus', async () => readAppLockStatus(context));

  handleDesktopIpc('appLock:setPin', async (_event, input) => {
    if (input.pin !== input.confirmPin) throw new DesktopIpcError('APP_LOCK_PIN_MISMATCH');
    await saveAppLockPin(input.pin);
    return readAppLockStatus(context);
  });

  handleDesktopIpc('appLock:verifyPin', async (_event, input) => ({
    ok: await verifyAppLockPin(input.pin),
  }));

  handleDesktopIpc('appLock:unlock', async (_event, input) => {
    const { settingsPersistence } = await context.getPersistenceModule();
    const store = await settingsPersistence.readStore();
    if (!store.settings.appLockEnabled) throw new DesktopIpcError('APP_LOCK_DISABLED');
    if (!(await hasAppLockPin())) throw new DesktopIpcError('APP_LOCK_PIN_REQUIRED');
    if (!(await verifyAppLockPin(input.pin))) throw new DesktopIpcError('APP_LOCK_PIN_INVALID');
    if (!store.settings.appLockLocked) return store;

    const nextStore = await settingsPersistence.saveSettings({ appLockLocked: false });
    context.sendFullStoreUpdated(nextStore);
    return nextStore;
  });

  handleDesktopIpc('appLock:setLocked', async (_event, input) => {
    if (!input.locked) throw new DesktopIpcError('APP_LOCK_UNLOCK_REQUIRED');
    const { settingsPersistence } = await context.getPersistenceModule();
    const store = await settingsPersistence.readStore();
    if (input.locked && !store.settings.appLockEnabled) {
      throw new DesktopIpcError('APP_LOCK_DISABLED');
    }
    if (input.locked && !(await hasAppLockPin())) {
      throw new DesktopIpcError('APP_LOCK_PIN_REQUIRED');
    }
    const nextStore = rendererStoreForAppLockState(
      await settingsPersistence.saveSettings({ appLockLocked: input.locked }),
    );
    context.sendFullStoreUpdated(nextStore);
    return nextStore;
  });

  handleDesktopIpc('appLock:setEnabled', async (_event, input) => {
    await assertCanSetAppLockEnabled(input);
    const { settingsPersistence } = await context.getPersistenceModule();
    const store = await settingsPersistence.saveSettings({
      appLockEnabled: input.enabled,
      appLockLockOnStartup: input.enabled ? undefined : false,
      appLockLocked: input.enabled ? undefined : false,
    });
    if (!input.enabled) await deleteAppLockPin();
    context.sendFullStoreUpdated(store);
    return store;
  });

  handleDesktopIpc('appLock:setShortcut', async (_event, input) => {
    const { settingsPersistence } = await context.getPersistenceModule();
    const store = await settingsPersistence.saveSettings({
      appLockShortcut: normalizeShortcutInput(input),
    });
    context.sendFullStoreUpdated(store);
    return store;
  });
}

async function readAppLockStatus(context: AppLockIpcContext) {
  const { settingsPersistence } = await context.getPersistenceModule();
  const store = await settingsPersistence.readStore();
  return {
    configured: await hasAppLockPin(),
    enabled: Boolean(store.settings.appLockEnabled),
    locked: Boolean(store.settings.appLockEnabled && store.settings.appLockLocked),
    shortcut: store.settings.appLockShortcut,
  };
}

async function assertCanSetAppLockEnabled(input: AppLockSetEnabledInput) {
  if (input.enabled) {
    if (!(await hasAppLockPin())) throw new DesktopIpcError('APP_LOCK_PIN_REQUIRED');
    return;
  }

  if (!input.pin || !(await verifyAppLockPin(input.pin))) {
    throw new DesktopIpcError('APP_LOCK_PIN_INVALID');
  }
}

function normalizeShortcutInput(input: AppLockSetShortcutInput) {
  return input.shortcut?.trim() || undefined;
}
