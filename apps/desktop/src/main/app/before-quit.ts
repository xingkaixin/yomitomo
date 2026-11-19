const DEFAULT_DISPOSE_TIMEOUT_MS = 5_000;

export function createBeforeQuitHandler(input: {
  dispose: () => void | Promise<void>;
  finalize?: () => void;
  quit: () => void;
  logError: (event: string, error: unknown) => void;
  timeoutMs?: number;
}) {
  let state: 'idle' | 'disposing' | 'ready' = 'idle';
  const timeoutMs = input.timeoutMs ?? DEFAULT_DISPOSE_TIMEOUT_MS;

  const finishQuit = () => {
    if (state === 'ready') return;
    state = 'ready';
    try {
      input.finalize?.();
    } catch (error: unknown) {
      input.logError('app.shutdown_finalize_failed', error);
    }
    input.quit();
  };

  return (event: { preventDefault: () => void }) => {
    if (state === 'ready') return;
    event.preventDefault();
    if (state === 'disposing') return;
    state = 'disposing';

    const timer = setTimeout(() => {
      if (state !== 'disposing') return;
      input.logError(
        'app.shutdown_timeout',
        new Error(`Application disposal timed out after ${timeoutMs}ms`),
      );
      finishQuit();
    }, timeoutMs);
    timer.unref?.();

    void Promise.resolve()
      .then(input.dispose)
      .then(
        () => {
          clearTimeout(timer);
          finishQuit();
        },
        (error: unknown) => {
          clearTimeout(timer);
          if (state !== 'disposing') return;
          input.logError('app.shutdown_failed', error);
          finishQuit();
        },
      );
  };
}
