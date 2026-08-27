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
    const onSaved = vi.fn();
    const run = latest.current!.run(() => pendingSave, { onSaved });
    view.unmount();

    await act(async () => {
      resolveSave('saved');
      await run;
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps the newest save active when an older request settles with %s',
    async (outcome) => {
      vi.useFakeTimers();
      const latest = renderSaveStatus();
      const first = deferred<string>();
      const second = deferred<string>();
      const onSaved = vi.fn();
      const onError = vi.fn();
      let firstRun: Promise<string | undefined> | undefined;
      let secondRun: Promise<string | undefined> | undefined;
      act(() => {
        firstRun = latest.current?.run(() => first.promise, { onSaved, onError });
        secondRun = latest.current?.run(() => second.promise);
      });
      await act(async () => {
        if (outcome === 'resolve') first.resolve('old');
        else first.reject(new Error('old failure'));
        await firstRun;
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(latest.current?.saveState).toBe('saving');
      expect(latest.current?.saveError).toBe('');
      expect(onSaved).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      await act(async () => {
        second.resolve('new');
        await secondRun;
      });
      expect(latest.current?.saveState).toBe('saved');
    },
  );
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
