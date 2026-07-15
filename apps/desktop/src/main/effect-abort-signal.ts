import { Effect } from 'effect';

export function withTimeoutAbortSignalEffect<A, E, R>(
  timeoutMs: number,
  parentSignals: readonly AbortSignal[],
  run: (signal: AbortSignal) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const signal = AbortSignal.any([controller.signal, ...parentSignals]);
      return { controller, signal, timeout };
    }),
    ({ signal }) => run(signal),
    ({ controller, timeout }) =>
      Effect.sync(() => {
        clearTimeout(timeout);
        controller.abort();
      }),
  );
}
