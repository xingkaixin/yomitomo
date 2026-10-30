import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDraftSaver, idleSaveStatus } from '../settings/settings-draft-saver';

afterEach(() => {
  vi.useRealTimers();
});

describe('createDraftSaver', () => {
  it('blocks duplicate manual requests while a save is pending', async () => {
    const pending = deferred<string>();
    const persist = vi.fn(() => pending.promise);
    const draft = startDraft({ persist });
    draft.update('changed');

    const first = draft.save();
    const second = draft.save();

    expect(draft.canSave()).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
    await expect(second).resolves.toBeUndefined();
    pending.resolve('saved');
    await first;
  });

  it('keeps manual saves blocked until every explicit override settles', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const persist = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue('saved C');
    const draft = startDraft({ persist });
    const firstRequest = draft.save('A');
    const secondRequest = draft.save('B');

    second.resolve('saved B');
    await secondRequest;
    expect(draft.status().saveState).toBe('saving');
    draft.update('C');
    await draft.save();
    expect(draft.canSave()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(2);

    first.reject(new Error('obsolete failure'));
    await firstRequest;
    expect(draft.canSave()).toBe(true);
    expect(draft.status()).toEqual(idleSaveStatus);
    await draft.save();
    expect(persist).toHaveBeenLastCalledWith('C');
  });

  it('saves changed values and resets saved state after the delay', async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue('saved-result');
    const onSaved = vi.fn();
    const draft = startDraft({ persist, onSaved });
    expect(draft.canSave()).toBe(false);

    draft.update('changed');
    expect(draft.canSave()).toBe(true);
    const result = await draft.save();

    expect(result).toBe('saved-result');
    expect(persist).toHaveBeenCalledWith('changed');
    expect(onSaved).toHaveBeenCalledWith('saved-result', 'changed');
    expect(draft.status().saveState).toBe('saved');

    vi.advanceTimersByTime(50);
    expect(draft.status().saveState).toBe('idle');
  });

  it('stores save errors and clears them on the next update', async () => {
    const draft = startDraft({ persist: vi.fn().mockRejectedValue(new Error('network failed')) });
    draft.update('changed');

    const result = await draft.save();

    expect(result).toBeUndefined();
    expect(draft.status()).toEqual({ saveError: 'network failed', saveState: 'error' });
    draft.update('changed again');
    expect(draft.status()).toEqual(idleSaveStatus);
  });

  it('does not persist unchanged values unless an override is provided', async () => {
    const persist = vi.fn().mockResolvedValue('saved-result');
    const draft = startDraft({ persist });

    await draft.save();
    expect(persist).not.toHaveBeenCalled();

    await draft.save('forced');
    expect(persist).toHaveBeenCalledWith('forced');
  });

  it('retries the last failed override without consulting the change predicate', async () => {
    const pending = deferred<string>();
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockReturnValueOnce(pending.promise);
    const draft = startDraft({ hasChanges: () => false, persist });

    await draft.save('changed');
    expect(draft.status().saveState).toBe('error');

    const retry = draft.save();
    await draft.save();
    expect(persist).toHaveBeenCalledTimes(2);
    pending.resolve('saved-result');
    await retry;

    expect(persist).toHaveBeenNthCalledWith(1, 'changed');
    expect(persist).toHaveBeenNthCalledWith(2, 'changed');
    expect(draft.status().saveState).toBe('saved');
  });

  it('does not retry an obsolete failure after the draft changes', async () => {
    const pending = deferred<string>();
    const persist = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('saved');
    const draft = startDraft({ persist });
    const request = draft.save('A');
    draft.update('B');

    pending.reject(new Error('old failure'));
    await request;
    expect(draft.status().saveState).toBe('idle');
    await draft.save();

    expect(persist).toHaveBeenLastCalledWith('B');
    expect(draft.status().saveError).toBe('');
  });

  it('does not apply or report an obsolete success after an update', async () => {
    const pending = deferred<string>();
    const onSaved = vi.fn();
    const draft = startDraft({ persist: () => pending.promise, onSaved });
    const request = draft.save('A');
    draft.update('B');

    pending.resolve('saved A');

    await expect(request).resolves.toBeUndefined();
    expect(draft.value()).toBe('B');
    expect(draft.status().saveState).toBe('idle');
    expect(onSaved).not.toHaveBeenCalled();
  });
});

function startDraft({
  hasChanges,
  persist,
  onSaved,
}: {
  hasChanges?: () => boolean;
  persist: (value: string) => Promise<string>;
  onSaved?: (result: string, value: string) => boolean | void;
}) {
  let value = 'saved';
  let status = idleSaveStatus;
  const saver = createDraftSaver<string, string>({
    errorMessage: (error) => (error instanceof Error ? error.message : 'save failed'),
    getValue: () => value,
    hasChanges: hasChanges ?? (() => value !== 'saved'),
    onSaved,
    persist,
    resetDelayMs: 50,
    setStatus: (next) => {
      status = next;
    },
    setValue: (next) => {
      value = next;
    },
  });
  return { ...saver, status: () => status, value: () => value };
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
