export function createBeforeQuitHandler(input: {
  dispose: () => void | Promise<void>;
  quit: () => void;
  logError: (event: string, error: unknown) => void;
}) {
  let state: 'idle' | 'disposing' | 'ready' = 'idle';

  return (event: { preventDefault: () => void }) => {
    if (state === 'ready') return;
    event.preventDefault();
    if (state === 'disposing') return;
    state = 'disposing';
    void Promise.resolve()
      .then(input.dispose)
      .then(
        () => {
          state = 'ready';
          input.quit();
        },
        (error: unknown) => {
          state = 'idle';
          input.logError('app.shutdown_failed', error);
        },
      );
  };
}
