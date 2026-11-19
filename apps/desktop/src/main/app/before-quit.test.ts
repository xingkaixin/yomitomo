import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBeforeQuitHandler } from './before-quit';

afterEach(() => {
  vi.useRealTimers();
});

describe('before quit', () => {
  it('blocks repeated quit requests until disposal finishes, then finalizes and continues once', async () => {
    let release!: () => void;
    const disposal = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const dispose = vi.fn(() =>
      disposal.then(() => {
        order.push('dispose');
      }),
    );
    const finalize = vi.fn(() => {
      order.push('finalize');
    });
    const logError = vi.fn();
    const continued = { preventDefault: vi.fn() };
    const quit = vi.fn(() => {
      order.push('quit');
      handler(continued);
    });
    const handler = createBeforeQuitHandler({ dispose, finalize, quit, logError });
    const first = { preventDefault: vi.fn() };
    const repeated = { preventDefault: vi.fn() };

    handler(first);
    handler(repeated);
    await Promise.resolve();

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    expect(continued.preventDefault).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(order).toEqual(['dispose', 'finalize', 'quit']);
    expect(logError).not.toHaveBeenCalled();
  });

  it('finalizes and quits when disposal exceeds the timeout', async () => {
    vi.useFakeTimers();
    let resolveLate!: () => void;
    const dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLate = resolve;
        }),
    );
    const finalize = vi.fn();
    const quit = vi.fn();
    const logError = vi.fn();
    const handler = createBeforeQuitHandler({ dispose, finalize, quit, logError, timeoutMs: 200 });

    handler({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(200);

    expect(logError).toHaveBeenCalledWith('app.shutdown_timeout', expect.any(Error));
    expect(finalize).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();

    resolveLate();
    await Promise.resolve();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('finalizes and quits even when disposal rejects', async () => {
    const error = new Error('dispose boom');
    const dispose = vi.fn(async () => {
      throw error;
    });
    const finalize = vi.fn();
    const quit = vi.fn();
    const logError = vi.fn();
    const handler = createBeforeQuitHandler({ dispose, finalize, quit, logError });

    handler({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    expect(logError).toHaveBeenCalledWith('app.shutdown_failed', error);
    expect(finalize).toHaveBeenCalledOnce();
  });
});
