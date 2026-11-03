import { describe, expect, it, vi } from 'vitest';
import { claimDesktopAppInstance } from './desktop-app-instance';

describe('desktop app instance', () => {
  it('quits when another process owns the app data', () => {
    const input = createInput(false);

    expect(claimDesktopAppInstance(input.options)).toBe(false);

    expect(input.quit).toHaveBeenCalledOnce();
    expect(input.onSecondInstance).not.toHaveBeenCalled();
  });
});

function createInput(ownsLock: boolean) {
  const quit = vi.fn();
  const onSecondInstance = vi.fn();
  return {
    quit,
    onSecondInstance,
    options: {
      requestLock: () => ownsLock,
      quit,
      onSecondInstance,
      getWindow: () => null,
    },
  };
}
