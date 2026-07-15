import { Effect } from 'effect';
import type { AssistantRuntimeOptions } from './assistant-runtime-types';
import { AssistantRuntimeProviderFailure } from './assistant-runtime-errors';

export function promiseEffect<T, E extends Error>(
  promise: PromiseLike<T>,
  ErrorClass: new (cause: unknown) => E,
) {
  return Effect.tryPromise({
    try: () => Promise.resolve(promise),
    catch: (error) => new ErrorClass(error),
  });
}

export function modelAdapterEffect(
  modelAdapter: AssistantRuntimeOptions['modelAdapter'],
  turn: Parameters<AssistantRuntimeOptions['modelAdapter']>[0],
) {
  return Effect.tryPromise({
    try: () => modelAdapter(turn),
    catch: (error) => new AssistantRuntimeProviderFailure(error),
  });
}
