// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStore } from '../settings/app-settings';
import { appSettingsActions } from '../settings/app-settings-actions';
import { useAppLockSettingsWorkflow } from '../settings/use-app-lock-settings-workflow';

vi.mock('../settings/app-settings-actions', () => ({
  appSettingsActions: {
    disableAppLock: vi.fn(),
    enableAppLock: vi.fn(),
  },
}));

const messages = {
  confirmPinMismatch: 'PIN mismatch',
  disablePinRequired: 'Disable PIN required',
  pinRequired: 'PIN required',
  retryAfter: (seconds: number) => `Retry in ${seconds}`,
  saveFailed: 'Save failed',
};

describe('useAppLockSettingsWorkflow', () => {
  beforeEach(() => {
    vi.mocked(appSettingsActions.enableAppLock).mockReset();
    vi.mocked(appSettingsActions.disableAppLock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enables the lock through PIN and confirmation states', async () => {
    vi.useFakeTimers();
    const onSettingsChange = vi.fn();
    vi.mocked(appSettingsActions.enableAppLock).mockResolvedValue({
      ...emptyStore,
      settings: { appLockEnabled: true },
    });
    const { result } = renderWorkflow(onSettingsChange);

    act(() => result.current.open(true));
    expect(result.current.state).toEqual({ phase: 'enable-pin', pin: '' });

    act(() => result.current.updatePin('12a34'));
    await act(() => result.current.submit());
    expect(result.current.state).toEqual({ phase: 'confirm', pin: '1234', confirmPin: '' });

    act(() => result.current.updatePin('1234'));
    await act(() => result.current.submit());

    expect(appSettingsActions.enableAppLock).toHaveBeenCalledWith('1234', '1234');
    expect(onSettingsChange).toHaveBeenCalledWith({ appLockEnabled: true });
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'saved' });
    expect(JSON.stringify(result.current.state)).not.toContain('1234');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'idle' });
  });

  it('clears confirmation input on mismatch and all PINs on close', async () => {
    const { result } = renderWorkflow();

    act(() => result.current.open(true));
    act(() => result.current.updatePin('1234'));
    await act(() => result.current.submit());
    act(() => result.current.updatePin('9999'));
    await act(() => result.current.submit());

    expect(result.current.state).toEqual({
      phase: 'error',
      step: 'confirm',
      pin: '1234',
      confirmPin: '',
      message: 'PIN mismatch',
    });
    act(() => result.current.close());
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'idle' });
    expect(JSON.stringify(result.current.state)).not.toMatch(/1234|9999/);
  });

  it('disables the lock with the current PIN', async () => {
    const onSettingsChange = vi.fn();
    vi.mocked(appSettingsActions.disableAppLock).mockResolvedValue({
      ...emptyStore,
      settings: { appLockEnabled: false },
    });
    const { result } = renderWorkflow(onSettingsChange);

    act(() => result.current.open(false));
    act(() => result.current.updatePin('5678'));
    await act(() => result.current.submit());

    expect(appSettingsActions.disableAppLock).toHaveBeenCalledWith('5678');
    expect(onSettingsChange).toHaveBeenCalledWith({ appLockEnabled: false });
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'saved' });
  });

  it('retains a failed request for retry and clears it after success', async () => {
    vi.mocked(appSettingsActions.disableAppLock)
      .mockRejectedValueOnce(new Error('Keyring unavailable'))
      .mockResolvedValueOnce({
        ...emptyStore,
        settings: { appLockEnabled: false },
      });
    const { result } = renderWorkflow();

    act(() => result.current.open(false));
    act(() => result.current.updatePin('5678'));
    await act(() => result.current.submit());

    expect(result.current.state).toEqual({
      phase: 'error',
      step: 'disable',
      pin: '5678',
      message: 'Keyring unavailable',
    });

    await act(() => result.current.submit());
    expect(appSettingsActions.disableAppLock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'saved' });
    expect(JSON.stringify(result.current.state)).not.toContain('5678');
  });

  it('ignores close intent while persistence is in flight', async () => {
    const request = deferred<ReturnType<typeof enabledStore>>();
    vi.mocked(appSettingsActions.enableAppLock).mockReturnValue(request.promise);
    const { result } = renderWorkflow();

    act(() => result.current.open(true));
    act(() => result.current.updatePin('1234'));
    await act(() => result.current.submit());
    act(() => result.current.updatePin('1234'));
    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit();
    });

    expect(result.current.state).toEqual({ phase: 'saving', operation: 'enable' });
    act(() => result.current.close());
    expect(result.current.state).toEqual({ phase: 'saving', operation: 'enable' });

    await act(async () => {
      request.resolve(enabledStore());
      await submitPromise;
    });
    expect(result.current.state).toEqual({ phase: 'closed', saveState: 'saved' });
  });
});

function renderWorkflow(onSettingsChange = vi.fn()) {
  return renderHook(() =>
    useAppLockSettingsWorkflow({
      messages,
      onSettingsChange,
    }),
  );
}

function enabledStore() {
  return {
    ...emptyStore,
    settings: { appLockEnabled: true },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
