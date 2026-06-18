// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { useAppLockController } from '../app-lock/app-lock-gate';
import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useAppLockController', () => {
  it('locks the app through the desktop preload facade', async () => {
    const lockedStore = makeStore({ appLockEnabled: true, appLockLocked: true });
    const onStoreUpdated = vi.fn();
    const latest: { current?: ReturnType<typeof useAppLockController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        setAppLockLocked: vi.fn().mockResolvedValue(lockedStore),
      },
    });

    render(<Harness latest={latest} onStoreUpdated={onStoreUpdated} />);

    await act(async () => {
      await latest.current?.lockApp();
    });

    expect(window.yomitomoDesktop.setAppLockLocked).toHaveBeenCalledWith({ locked: true });
    expect(onStoreUpdated).toHaveBeenCalledWith(lockedStore);
  });

  it('handles slide, invalid PIN, and successful unlock states', async () => {
    const unlockedStore = makeStore({ appLockEnabled: true, appLockLocked: false });
    const onStoreUpdated = vi.fn();
    const latest: { current?: ReturnType<typeof useAppLockController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        unlockAppLock: vi
          .fn()
          .mockRejectedValueOnce({ code: 'APP_LOCK_PIN_INVALID', message: 'bad pin' })
          .mockResolvedValueOnce(unlockedStore),
      },
    });

    render(<Harness latest={latest} locked onStoreUpdated={onStoreUpdated} />);

    act(() => {
      latest.current?.completeSlide();
    });
    expect(screen.getByTestId('step').textContent).toBe('pin');

    act(() => {
      latest.current?.updatePin('12a34');
    });
    expect(screen.getByTestId('pin').textContent).toBe('1234');

    await act(async () => {
      await latest.current?.unlockApp();
    });
    expect(screen.getByTestId('error').textContent).toBe('PIN 不正确。');
    expect(screen.getByTestId('pin').textContent).toBe('');

    act(() => {
      latest.current?.updatePin('1234');
    });
    await act(async () => {
      await latest.current?.unlockApp('1234');
    });

    expect(window.yomitomoDesktop.unlockAppLock).toHaveBeenLastCalledWith({ pin: '1234' });
    expect(onStoreUpdated).toHaveBeenCalledWith(unlockedStore);
  });
});

function Harness({
  enabled = true,
  latest,
  locked = false,
  onStoreUpdated,
}: {
  enabled?: boolean;
  latest: { current?: ReturnType<typeof useAppLockController> };
  locked?: boolean;
  onStoreUpdated: (store: DesktopStore) => void;
}) {
  const controller = useAppLockController({
    enabled,
    locked,
    onStoreUpdated,
  });
  latest.current = controller;

  return (
    <>
      <span data-testid="step">{controller.step}</span>
      <span data-testid="pin">{controller.pin}</span>
      <span data-testid="error">{controller.error}</span>
    </>
  );
}

function makeStore(settings: DesktopStore['settings']): DesktopStore {
  return {
    ...emptyStore,
    settings: {
      soundEffectsEnabled: false,
      ...settings,
    },
  };
}
