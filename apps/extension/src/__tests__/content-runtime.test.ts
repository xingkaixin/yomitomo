import { describe, expect, it, vi } from 'vitest';
import { registerContentToggleListener } from '../content-runtime';

describe('registerContentToggleListener', () => {
  it('registers one toggle listener per window', () => {
    const listeners: Array<(message: { type?: string }) => unknown> = [];
    const targetWindow = {} as Window;

    const first = registerContentToggleListener({
      addListener: (listener) => listeners.push(listener),
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });
    const second = registerContentToggleListener({
      addListener: (listener) => listeners.push(listener),
      targetWindow,
      toggleReader: vi.fn(),
      errorMessage: String,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(listeners).toHaveLength(1);
  });

  it('toggles only for yomitomo messages', async () => {
    const toggleReader = vi.fn().mockResolvedValue(undefined);
    let listener: ((message: { type?: string }) => Promise<unknown> | undefined) | undefined;

    registerContentToggleListener({
      addListener: (nextListener) => {
        listener = nextListener;
      },
      targetWindow: {} as Window,
      toggleReader,
      errorMessage: String,
    });

    expect(listener?.({ type: 'other' })).toBeUndefined();
    await expect(listener?.({ type: 'yomitomo:toggle' })).resolves.toEqual({ ok: true });
    await expect(listener?.({ type: 'yomitomo:toggle:v2' })).resolves.toEqual({ ok: true });
    expect(toggleReader).toHaveBeenCalledTimes(2);
  });
});
