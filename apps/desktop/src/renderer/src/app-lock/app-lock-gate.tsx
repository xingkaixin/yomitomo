import { lazy, Suspense, useReducer, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopStore } from '@yomitomo/shared';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useEventListener } from '@yomitomo/reader-ui/use-event-listener';
import { rendererStoreForAppLockState } from '../../../app-store';
import { desktopIpcErrorRetryAfterMs, isDesktopIpcErrorLike } from '../../../ipc-errors';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import { getDesktopApi } from '../shell/app-desktop-api';
import { appToast } from '../shell/app-toast';
import type { AppLockStep } from './app-lock-overlay';

const AppLockOverlay = lazy(() =>
  import('./app-lock-overlay').then((module) => ({ default: module.AppLockOverlay })),
);

export type AppLockRenderState = {
  enabled: boolean;
  locked: boolean;
  lockApp: () => Promise<void>;
  shortcutLabel: string;
};

type AppLockGateProps = {
  children: (state: AppLockRenderState) => ReactNode;
  enabled: boolean;
  locked: boolean;
  onStoreUpdated: (store: DesktopStore) => void;
};

export function AppLockGate({ children, enabled, locked, onStoreUpdated }: AppLockGateProps) {
  const controller = useAppLockController({ enabled, locked, onStoreUpdated });

  return (
    <>
      {locked
        ? null
        : children({
            enabled,
            locked,
            lockApp: controller.lockApp,
            shortcutLabel: controller.shortcutLabel,
          })}
      {locked ? (
        <Suspense fallback={<div aria-modal="true" className="app-lock-overlay" role="dialog" />}>
          <AppLockOverlay
            error={controller.error}
            inputKey={controller.inputKey}
            pin={controller.pin}
            step={controller.step}
            verifying={controller.verifying}
            onPinChange={controller.updatePin}
            onSlideComplete={controller.completeSlide}
            onUnlock={() => void controller.unlockApp()}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export function useAppLockController({
  enabled,
  locked,
  onStoreUpdated,
}: {
  enabled: boolean;
  locked: boolean;
  onStoreUpdated: (store: DesktopStore) => void;
}) {
  const { t } = useTranslation();
  const [{ error, inputKey, pin, step, verifying }, dispatch] = useReducer(
    appLockReducer,
    initialAppLockState,
  );
  const shortcutLabel = `${getShortcutModifier()}+L`;

  useEventListener(
    enabled && !locked ? window : null,
    'keydown',
    (event) => {
      if (!isAppLockShortcutEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void lockApp();
    },
    { capture: true },
  );

  async function lockApp() {
    if (!enabled) return;
    dispatch({ type: 'lockRequested' });
    try {
      const nextStore = await getDesktopApi().appLock.setLocked({ locked: true });
      onStoreUpdated(rendererStoreForAppLockState(nextStore));
      playAppSoundEffect('app_lock.locked', nextStore.settings);
    } catch {
      appToast.error(t('appLock.lockFailed'));
    }
  }

  function completeSlide() {
    dispatch({ type: 'slideCompleted' });
  }

  function updatePin(value: string) {
    dispatch({ type: 'pinEdited', pin: digitsOnly(value) });
  }

  async function unlockApp(pinOverride?: string) {
    const pinToVerify = pinOverride ?? pin;
    if (!validAppLockPin(pinToVerify) || verifying) return;
    dispatch({ type: 'unlockStarted' });
    try {
      const nextStore = await getDesktopApi().appLock.unlock({ pin: pinToVerify });
      onStoreUpdated(nextStore);
      playAppSoundEffect('app_lock.unlocked', nextStore.settings);
      dispatch({ type: 'unlocked' });
    } catch (unlockError) {
      const retryAfterMs = desktopIpcErrorRetryAfterMs(unlockError);
      dispatch({
        type: 'unlockRejected',
        error: retryAfterMs
          ? t('appLock.retryAfter', { seconds: Math.ceil(retryAfterMs / 1_000) })
          : isDesktopIpcErrorLike(unlockError) && unlockError.code === 'APP_LOCK_PIN_INVALID'
            ? t('appLock.invalidPin')
            : t('appLock.verifyFailed'),
      });
    }
  }

  return {
    completeSlide,
    error,
    inputKey,
    lockApp,
    pin,
    shortcutLabel,
    step,
    unlockApp,
    updatePin,
    verifying,
  };
}

type AppLockState = {
  error: string;
  inputKey: number;
  pin: string;
  step: AppLockStep;
  verifying: boolean;
};

type AppLockEvent =
  | { type: 'lockRequested' }
  | { type: 'pinEdited'; pin: string }
  | { type: 'slideCompleted' }
  | { type: 'unlockRejected'; error: string }
  | { type: 'unlockStarted' }
  | { type: 'unlocked' };

const initialAppLockState: AppLockState = {
  error: '',
  inputKey: 0,
  pin: '',
  step: 'slide',
  verifying: false,
};

function appLockReducer(state: AppLockState, event: AppLockEvent): AppLockState {
  switch (event.type) {
    case 'lockRequested':
      return { ...state, error: '', inputKey: state.inputKey + 1, pin: '', step: 'slide' };
    case 'pinEdited':
      return { ...state, error: '', pin: event.pin };
    case 'slideCompleted':
      return { ...state, error: '', inputKey: state.inputKey + 1, pin: '', step: 'pin' };
    case 'unlockRejected':
      return {
        ...state,
        error: event.error,
        inputKey: state.inputKey + 1,
        pin: '',
        verifying: false,
      };
    case 'unlockStarted':
      return { ...state, error: '', verifying: true };
    case 'unlocked':
      return { ...state, error: '', pin: '', step: 'slide', verifying: false };
  }
}

function isAppLockShortcutEvent(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (key !== 'l' || event.altKey || event.shiftKey || event.repeat) return false;
  return desktopPlatform() === 'darwin'
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

function desktopPlatform() {
  return getDesktopApi().platform;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validAppLockPin(value: string) {
  return /^\d{4}$/.test(value);
}
