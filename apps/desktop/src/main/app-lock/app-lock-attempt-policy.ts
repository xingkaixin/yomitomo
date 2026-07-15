import { performance } from 'node:perf_hooks';
import { verifyAppLockPin } from './app-lock-secrets';

const appLockCooldownScheduleMs = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000] as const;
const appLockAttemptsBeforeCooldown = 3;

export type AppLockPinAttemptResult =
  | { status: 'verified'; retryAfterMs: 0 }
  | { status: 'invalid' | 'blocked'; retryAfterMs: number };

type AppLockAttemptPolicyOptions = {
  now: () => number;
  verifyPin: (pin: string) => Promise<boolean>;
};

export function createAppLockAttemptPolicy({ now, verifyPin }: AppLockAttemptPolicyOptions) {
  let consecutiveFailureCount = 0;
  let cooldownUntil = 0;
  let verificationQueue = Promise.resolve();

  async function runVerification(pin: string): Promise<AppLockPinAttemptResult> {
    const retryAfterMs = remainingCooldownMs();
    if (retryAfterMs > 0) return { status: 'blocked', retryAfterMs };

    if (await verifyPin(pin)) {
      reset();
      return { status: 'verified', retryAfterMs: 0 };
    }

    consecutiveFailureCount += 1;
    const scheduleIndex = consecutiveFailureCount - appLockAttemptsBeforeCooldown;
    if (scheduleIndex < 0) return { status: 'invalid', retryAfterMs: 0 };

    const cooldownMs =
      appLockCooldownScheduleMs[Math.min(scheduleIndex, appLockCooldownScheduleMs.length - 1)];
    cooldownUntil = now() + cooldownMs;
    return { status: 'invalid', retryAfterMs: cooldownMs };
  }

  function verify(pin: string) {
    const result = verificationQueue.then(() => runVerification(pin));
    verificationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function remainingCooldownMs() {
    return Math.max(0, Math.ceil(cooldownUntil - now()));
  }

  function reset() {
    consecutiveFailureCount = 0;
    cooldownUntil = 0;
  }

  return { reset, verify };
}

const appLockAttemptPolicy = createAppLockAttemptPolicy({
  now: () => performance.now(),
  verifyPin: verifyAppLockPin,
});

export function verifyAppLockPinAttempt(pin: string) {
  return appLockAttemptPolicy.verify(pin);
}

export function resetAppLockPinAttempts() {
  appLockAttemptPolicy.reset();
}
