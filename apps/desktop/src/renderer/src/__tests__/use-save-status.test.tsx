// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveStatus, type SaveStatus } from '../settings/use-save-status';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useSaveStatus', () => {
  it('runs saves and resets saved state after the shared delay', async () => {
    vi.useFakeTimers();
    const latest = renderSaveStatus();
    const task = vi.fn().mockResolvedValue('saved');

    await act(async () => {
      await latest.current?.run(task);
    });

    expect(latest.current?.saveState).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(latest.current?.saveState).toBe('idle');
  });

  it('stores formatted errors and exposes the failed action', async () => {
    const latest = renderSaveStatus();
    const error = new Error('network failed');
    const onError = vi.fn();

    await act(async () => {
      await latest.current?.run(() => Promise.reject(error), { onError });
    });

    expect(latest.current?.saveState).toBe('error');
    expect(latest.current?.saveError).toBe('save failed: network failed');
    expect(onError).toHaveBeenCalledWith(error, 'save failed: network failed');
  });

  it('does not schedule a reset when an in-flight save resolves after unmount', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    let resolveSave!: (value: string) => void;
    const pendingSave = new Promise<string>((resolve) => {
      resolveSave = resolve;
    });
    const latest: { current?: SaveStatus } = {};

    function Harness() {
      latest.current = useSaveStatus({
        errorMessage: String,
        resetDelayMs: 50,
      });
      return null;
    }

    const view = render(<Harness />);
    const run = latest.current!.run(() => pendingSave);
    view.unmount();

    await act(async () => {
      resolveSave('saved');
      await run;
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

function renderSaveStatus() {
  const latest: { current?: SaveStatus } = {};

  function Harness() {
    latest.current = useSaveStatus({
      errorMessage: (error) =>
        `save failed: ${error instanceof Error ? error.message : String(error)}`,
      resetDelayMs: 50,
    });
    return null;
  }

  render(<Harness />);
  return latest;
}
