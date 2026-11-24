import { HugeiconsIcon } from '@hugeicons/react';
import { LockKeyIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { ShimmeringText } from '../components/ui/shimmering-text';
import {
  SlideToUnlock,
  SlideToUnlockHandle,
  SlideToUnlockText,
  SlideToUnlockTrack,
} from '../components/ui/slide-to-unlock';

export type AppLockStep = 'slide' | 'pin';

export type AppLockOverlayProps = {
  error: string;
  inputKey: number;
  pin: string;
  step: AppLockStep;
  verifying: boolean;
  onPinChange: (value: string) => void;
  onSlideComplete: () => void;
  onUnlock: (pin?: string) => void;
};

export function AppLockOverlay({
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

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validAppLockPin(value: string) {
  return /^\d{4}$/.test(value);
}
