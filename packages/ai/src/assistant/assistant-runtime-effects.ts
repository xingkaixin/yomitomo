import { Effect } from 'effect';

export function promiseEffect<T, E extends Error>(
  promise: PromiseLike<T>,
  ErrorClass: new (cause: unknown) => E,
) {
  return Effect.tryPromise({
    try: () => Promise.resolve(promise),
    catch: (error) => new ErrorClass(error),
  });
}
