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
});

function renderDraft({
  persist,
  onSaved,
}: {
  persist: (value: string) => Promise<string>;
  onSaved?: (result: string, value: string) => boolean | void;
}) {
  const latest: { current?: SaveableDraft<string, string> } = {};

  function Harness() {
    const [value, setValue] = React.useState('saved');
    latest.current = useSaveableDraft({
      value,
      canSave: (nextValue) => nextValue !== 'saved',
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
