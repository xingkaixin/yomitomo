import { describe, expect, it, vi } from 'vitest';
import { claimDesktopAppInstance } from './desktop-app-instance';

describe('desktop app instance', () => {
  it('quits when another process owns the app data', () => {
    const input = createInput(false);

    expect(claimDesktopAppInstance(input.options)).toBe(false);

    expect(input.quit).toHaveBeenCalledOnce();
    expect(input.onSecondInstance).not.toHaveBeenCalled();
  });

  it('claims ownership and focuses the existing window for later launches', () => {
    const input = createInput(true);

    expect(claimDesktopAppInstance(input.options)).toBe(true);
    input.secondInstance();

    expect(input.restore).not.toHaveBeenCalled();
    expect(input.show).toHaveBeenCalledOnce();
    expect(input.focus).toHaveBeenCalledOnce();
    expect(input.quit).not.toHaveBeenCalled();
  });

  it('restores a minimized window before focusing it', () => {
    const input = createInput(true, true);

    claimDesktopAppInstance(input.options);
    input.secondInstance();

    expect(input.restore).toHaveBeenCalledOnce();
    expect(input.show).toHaveBeenCalledOnce();
    expect(input.focus).toHaveBeenCalledOnce();
  });
});

function createInput(ownsLock: boolean, minimized = false) {
  let listener = noop;
  const quit = vi.fn();
  const onSecondInstance = vi.fn((nextListener: () => void) => {
    listener = nextListener;
  });
  const restore = vi.fn();
  const show = vi.fn();
  const focus = vi.fn();
  return {
    quit,
    onSecondInstance,
    restore,
    show,
    focus,
    secondInstance: () => listener(),
    options: {
      requestLock: () => ownsLock,
      quit,
      onSecondInstance,
      getWindow: () => ({
        isMinimized: () => minimized,
        restore,
        show,
        focus,
      }),
    },
  };
}

function noop() {}
