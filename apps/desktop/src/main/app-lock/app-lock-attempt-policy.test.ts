import { describe, expect, it, vi } from 'vitest';
import { createAppLockAttemptPolicy } from './app-lock-attempt-policy';

describe('app lock attempt policy', () => {
  it('applies increasing cooldowns and resets after successful verification', async () => {
    let now = 100;
    const verifyPin = vi.fn().mockResolvedValue(false);
    const policy = createAppLockAttemptPolicy({ now: () => now, verifyPin });

    await expect(policy.verify('0001')).resolves.toEqual({ status: 'invalid', retryAfterMs: 0 });
    await expect(policy.verify('0002')).resolves.toEqual({ status: 'invalid', retryAfterMs: 0 });
    await expect(policy.verify('0003')).resolves.toEqual({
      status: 'invalid',
      retryAfterMs: 1_000,
    });
    await expect(policy.verify('0004')).resolves.toEqual({
      status: 'blocked',
      retryAfterMs: 1_000,
    });
    expect(verifyPin).toHaveBeenCalledTimes(3);

    now += 1_000;
    await expect(policy.verify('0004')).resolves.toEqual({
      status: 'invalid',
      retryAfterMs: 2_000,
    });

    now += 2_000;
    verifyPin.mockResolvedValueOnce(true);
    await expect(policy.verify('1234')).resolves.toEqual({
      status: 'verified',
      retryAfterMs: 0,
    });
    await expect(policy.verify('0005')).resolves.toEqual({ status: 'invalid', retryAfterMs: 0 });
  });

  it('serializes parallel attempts and skips hashing after the cooldown starts', async () => {
    let activeVerificationCount = 0;
    let maximumActiveVerificationCount = 0;
    const verifyPin = vi.fn(async () => {
      activeVerificationCount += 1;
      maximumActiveVerificationCount = Math.max(
        maximumActiveVerificationCount,
        activeVerificationCount,
      );
      await Promise.resolve();
      activeVerificationCount -= 1;
      return false;
    });
    const policy = createAppLockAttemptPolicy({ now: () => 0, verifyPin });

    const results = await Promise.all([
      policy.verify('0001'),
      policy.verify('0002'),
      policy.verify('0003'),
      policy.verify('0004'),
    ]);

    expect(maximumActiveVerificationCount).toBe(1);
    expect(verifyPin).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { status: 'invalid', retryAfterMs: 0 },
      { status: 'invalid', retryAfterMs: 0 },
      { status: 'invalid', retryAfterMs: 1_000 },
      { status: 'blocked', retryAfterMs: 1_000 },
    ]);
  });

  it('clears cooldown state when app lock is reset', async () => {
    const verifyPin = vi.fn().mockResolvedValue(false);
    const policy = createAppLockAttemptPolicy({ now: () => 0, verifyPin });

    await policy.verify('0001');
    await policy.verify('0002');
    await policy.verify('0003');
    policy.reset();

    await expect(policy.verify('0004')).resolves.toEqual({ status: 'invalid', retryAfterMs: 0 });
    expect(verifyPin).toHaveBeenCalledTimes(4);
  });
});
