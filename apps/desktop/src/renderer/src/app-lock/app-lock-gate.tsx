import { HugeiconsIcon } from '@hugeicons/react';
import { LockKeyIcon } from '@hugeicons/core-free-icons';
import { useReducer, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopStore } from '@yomitomo/shared';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useEventListener } from '@yomitomo/reader-ui/use-event-listener';
import { rendererStoreForAppLockState } from '../../../app-store';
import { desktopIpcErrorRetryAfterMs, isDesktopIpcErrorLike } from '../../../ipc-errors';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { ShimmeringText } from '../components/ui/shimmering-text';
import {
  SlideToUnlock,
  SlideToUnlockHandle,
  SlideToUnlockText,
  SlideToUnlockTrack,
} from '../components/ui/slide-to-unlock';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import { getDesktopApi } from '../shell/app-desktop-api';

type AppLockStep = 'slide' | 'pin';

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
      dispatch({ type: 'failed', error: t('appLock.verifyFailed') });
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
  | { type: 'failed'; error: string }
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
    case 'failed':
      return { ...state, error: event.error };
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

type AppLockOverlayProps = {
  error: string;
  inputKey: number;
  pin: string;
  step: AppLockStep;
  verifying: boolean;
  onPinChange: (value: string) => void;
  onSlideComplete: () => void;
  onUnlock: (pin?: string) => void;
};

function AppLockOverlay({
  error,
  inputKey,
  pin,
  step,
  verifying,
  onPinChange,
  onSlideComplete,
  onUnlock,
}: AppLockOverlayProps) {
  const { t } = useTranslation();
  const pinReady = validAppLockPin(pin);
  return (
    <div
      aria-labelledby="app-lock-title"
      aria-modal="true"
      className="app-lock-overlay"
      role="dialog"
    >
      <div className="app-lock-panel" data-step={step}>
        <span className="app-lock-icon" aria-hidden="true">
          <HugeiconsIcon icon={LockKeyIcon} size={24} />
        </span>
        <h2 id="app-lock-title">{t('appLock.title')}</h2>
        {step === 'pin' ? <p>{t('appLock.pinDescription')}</p> : null}
        {step === 'slide' ? (
          <SlideToUnlock className="app-lock-slide" onUnlock={onSlideComplete}>
            <SlideToUnlockTrack>
              <SlideToUnlockText>
                {({ isDragging }) => (
                  <ShimmeringText text={t('appLock.slideLabel')} isStopped={isDragging} />
                )}
              </SlideToUnlockText>
              <SlideToUnlockHandle aria-label={t('appLock.slideLabel')} />
            </SlideToUnlockTrack>
          </SlideToUnlock>
        ) : (
          <form
            className="app-lock-pin-form"
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock();
            }}
          >
            <PinOtpInput
              key={inputKey}
              ariaLabel={t('appLock.pinLabel')}
              autoFocus
              disabled={verifying}
              value={pin}
              onChange={onPinChange}
              onComplete={onUnlock}
            />
            {error ? (
              <span className="app-lock-error" role="alert">
                {error}
              </span>
            ) : null}
            <button
              className="app-lock-unlock-button"
              disabled={!pinReady || verifying}
              type="submit"
            >
              {verifying ? t('appLock.verifying') : t('appLock.unlock')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PinOtpInput({
  ariaLabel,
  autoFocus = false,
  disabled = false,
  value,
  onChange,
  onComplete,
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}) {
  return (
    <InputOTP
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      maxLength={4}
      value={value}
      onChange={(nextValue) => onChange(digitsOnly(nextValue))}
      onComplete={(nextValue) => {
        const nextPin = digitsOnly(String(nextValue));
        onChange(nextPin);
        window.setTimeout(() => onComplete?.(nextPin), 0);
      }}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  );
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
