import { describe, expect, it, vi } from 'vitest';
import { createBeforeQuitHandler } from './before-quit';

describe('before quit', () => {
  it('blocks repeated quit requests until disposal finishes, then continues once', async () => {
    let release!: () => void;
    const disposal = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispose = vi.fn(() => disposal);
    const logError = vi.fn();
    const continued = { preventDefault: vi.fn() };
    const quit = vi.fn(() => handler(continued));
    const handler = createBeforeQuitHandler({ dispose, quit, logError });
    const first = { preventDefault: vi.fn() };
    const repeated = { preventDefault: vi.fn() };

    handler(first);
    handler(repeated);
    await Promise.resolve();

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    expect(continued.preventDefault).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });
});
