import { useEffect, useState, type ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DesktopStore } from '@yomitomo/shared';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { isDesktopIpcErrorLike } from '../../../ipc-errors';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { ShimmeringText } from '../components/ui/shimmering-text';
import {
  SlideToUnlock,
  SlideToUnlockHandle,
  SlideToUnlockText,
  SlideToUnlockTrack,
} from '../components/ui/slide-to-unlock';
import { playAppSoundEffect } from '../sound/app-sound-effects';

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
      {children({
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
  const [step, setStep] = useState<AppLockStep>('slide');
  const [pin, setPin] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const shortcutLabel = `${getShortcutModifier()}+L`;

  useEffect(() => {
    if (!locked) {
      setStep('slide');
      setPin('');
      setError('');
    }
  }, [locked]);

  useEffect(() => {
    if (!enabled || locked) return;
    function handleAppLockShortcut(event: KeyboardEvent) {
      if (!isAppLockShortcutEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void lockApp();
    }
    window.addEventListener('keydown', handleAppLockShortcut, true);
    return () => window.removeEventListener('keydown', handleAppLockShortcut, true);
  }, [enabled, locked]);

  async function lockApp() {
    if (!enabled) return;
    setStep('slide');
    setPin('');
    setInputKey((key) => key + 1);
    setError('');
    try {
      const nextStore = await window.yomitomoDesktop.setAppLockLocked({ locked: true });
      onStoreUpdated(nextStore);
      playAppSoundEffect('app_lock.locked', nextStore.settings);
    } catch {
      setError(t('appLock.verifyFailed'));
    }
  }

  function completeSlide() {
    setStep('pin');
    setPin('');
    setInputKey((key) => key + 1);
    setError('');
  }

  function updatePin(value: string) {
    setPin(digitsOnly(value));
    setError('');
  }

  async function unlockApp(pinOverride?: string) {
    const pinToVerify = pinOverride ?? pin;
    if (!validAppLockPin(pinToVerify) || verifying) return;
    setVerifying(true);
    setError('');
    try {
      const nextStore = await window.yomitomoDesktop.unlockAppLock({ pin: pinToVerify });
      onStoreUpdated(nextStore);
      playAppSoundEffect('app_lock.unlocked', nextStore.settings);
      setStep('slide');
      setPin('');
    } catch (unlockError) {
      setError(
        isDesktopIpcErrorLike(unlockError) && unlockError.code === 'APP_LOCK_PIN_INVALID'
          ? t('appLock.invalidPin')
          : t('appLock.verifyFailed'),
      );
      setPin('');
      setInputKey((key) => key + 1);
    } finally {
      setVerifying(false);
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
          <LockKeyhole size={24} />
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
  return window.yomitomoDesktop?.platform ?? 'unknown';
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validAppLockPin(value: string) {
  return /^\d{4}$/.test(value);
}
