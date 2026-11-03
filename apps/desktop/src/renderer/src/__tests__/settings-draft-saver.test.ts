import { describe, expect, it, vi } from 'vitest';

import { createDraftSaver, idleSaveStatus } from '../settings/settings-draft-saver';

describe('createDraftSaver', () => {
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
  persist,
  onSaved,
}: {
  persist: (value: string) => Promise<string>;
  onSaved?: (result: string, value: string) => boolean | void;
}) {
  let value = 'saved';
  let status = idleSaveStatus;
  const saver = createDraftSaver<string, string>({
    errorMessage: (error) => (error instanceof Error ? error.message : 'save failed'),
    getValue: () => value,
    hasChanges: () => value !== 'saved',
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
