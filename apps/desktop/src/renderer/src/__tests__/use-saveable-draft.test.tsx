// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSaveableDraft, type SaveableDraft } from '../settings/use-saveable-draft';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useSaveableDraft', () => {
  it('blocks duplicate manual requests before React rerenders', async () => {
    const pending = deferred<string>();
    const persist = vi.fn(() => pending.promise);
    const latest = renderDraft({ persist });
    act(() => latest.current?.update('changed'));
    let first: Promise<string | undefined> | undefined;
    let second: Promise<string | undefined> | undefined;
    act(() => {
      first = latest.current?.save();
      second = latest.current?.save();
    });
    expect(latest.current?.canSave).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
    await expect(second).resolves.toBeUndefined();
    await act(async () => {
      pending.resolve('saved');
      await first;
    });
  });

  it('keeps manual saves blocked until every explicit override settles', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const persist = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue('saved C');
    const latest = renderDraft({ persist });
    let firstRequest: Promise<string | undefined> | undefined;
    let secondRequest: Promise<string | undefined> | undefined;
    act(() => {
      firstRequest = latest.current?.save('A');
      secondRequest = latest.current?.save('B');
    });
    await act(async () => {
      second.resolve('saved B');
      await secondRequest;
    });
    expect(latest.current?.saveState).toBe('saving');
    act(() => latest.current?.update('C'));
    await act(async () => void (await latest.current?.save()));
    expect(latest.current?.canSave).toBe(false);
    expect(persist).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.reject(new Error('obsolete failure'));
      await firstRequest;
    });
    expect(latest.current?.canSave).toBe(true);
    expect(latest.current?.saveState).toBe('idle');
    expect(latest.current?.saveError).toBe('');
    await act(async () => void (await latest.current?.save()));
    expect(persist).toHaveBeenLastCalledWith('C');
  });

  it('saves changed values and resets saved state after the delay', async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue('saved-result');
    const onSaved = vi.fn();
    const latest = renderDraft({ persist, onSaved });

    expect(latest.current?.canSave).toBe(false);

    act(() => {
      latest.current?.update('changed');
    });
    expect(latest.current?.canSave).toBe(true);

    let result: string | undefined;
    await act(async () => {
      result = await latest.current?.save();
    });

    expect(result).toBe('saved-result');
    expect(persist).toHaveBeenCalledWith('changed');
    expect(onSaved).toHaveBeenCalledWith('saved-result', 'changed');
    expect(latest.current?.saveState).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(latest.current?.saveState).toBe('idle');
  });

  it('stores save errors and clears them on the next update', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('network failed'));
    const latest = renderDraft({ persist });

    act(() => {
      latest.current?.update('changed');
    });

    let result: string | undefined;
    await act(async () => {
      result = await latest.current?.save();
    });

    expect(result).toBeUndefined();
    expect(latest.current?.saveState).toBe('error');
    expect(latest.current?.saveError).toBe('network failed');

    act(() => {
      latest.current?.update('changed again');
    });

    expect(latest.current?.saveState).toBe('idle');
    expect(latest.current?.saveError).toBe('');
  });

  it('does not persist unchanged values unless an override is provided', async () => {
    const persist = vi.fn().mockResolvedValue('saved-result');
    const latest = renderDraft({ persist });

    await act(async () => {
      await latest.current?.save();
    });

    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      await latest.current?.save('forced');
    });

    expect(persist).toHaveBeenCalledWith('forced');
  });

  it('retries the last failed override without consulting the change predicate', async () => {
    const pending = deferred<string>();
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockReturnValueOnce(pending.promise);
    const latest = renderDraft({ canSave: () => false, persist });

    await act(async () => {
      await latest.current?.save('changed');
    });
    expect(latest.current?.saveState).toBe('error');

    let retry: Promise<string | undefined> | undefined;
    act(() => {
      retry = latest.current?.save();
    });
    await act(async () => void (await latest.current?.save()));
    expect(persist).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.resolve('saved-result');
      await retry;
    });

    expect(persist).toHaveBeenNthCalledWith(1, 'changed');
    expect(persist).toHaveBeenNthCalledWith(2, 'changed');
    expect(latest.current?.saveState).toBe('saved');
  });

  it('does not retry an obsolete failure after the draft changes', async () => {
    const pending = deferred<string>();
    const persist = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('saved');
    const latest = renderDraft({ persist });
    let request: Promise<string | undefined> | undefined;
    act(() => {
      request = latest.current?.save('A');
    });
    act(() => latest.current?.update('B'));
    await act(async () => {
      pending.reject(new Error('old failure'));
      await request;
    });
    expect(latest.current?.saveState).toBe('idle');
    await act(async () => void (await latest.current?.save()));
    expect(persist).toHaveBeenLastCalledWith('B');
    expect(latest.current?.saveError).toBe('');
  });

  it('does not apply or report an obsolete success after reset', async () => {
    const pending = deferred<string>();
    const onSaved = vi.fn();
    const latest = renderDraft({ persist: () => pending.promise, onSaved });
    let request: Promise<string | undefined> | undefined;
    act(() => {
      request = latest.current?.save('A');
    });
    act(() => latest.current?.reset('B'));
    let saved: string | undefined;
    await act(async () => {
      pending.resolve('saved A');
      saved = await request;
    });
    expect(latest.current?.value).toBe('B');
    expect(latest.current?.saveState).toBe('idle');
    expect(onSaved).not.toHaveBeenCalled();
    expect(saved).toBeUndefined();
  });
});

function renderDraft({
  canSave = (value) => value !== 'saved',
  persist,
  onSaved,
}: {
  canSave?: (value: string) => boolean;
  persist: (value: string) => Promise<string>;
  onSaved?: (result: string, value: string) => boolean | void;
}) {
  const latest: { current?: SaveableDraft<string, string> } = {};

  function Harness() {
    const [value, setValue] = React.useState('saved');
    latest.current = useSaveableDraft({
      value,
      canSave,
      errorMessage: (error) => (error instanceof Error ? error.message : 'save failed'),
      onChange: setValue,
      onSaved,
      persist,
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
