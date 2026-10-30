import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * Returns a function with a stable identity that calls the latest callback. Call it from ref
 * callbacks, event handlers, timers, and subscriptions; during render it still runs the previous
 * commit's callback.
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  // Insertion effects run before React attaches refs in the same commit, so a ref callback
  // already calls this render's callback.
  useInsertionEffect(() => {
    callbackRef.current = callback;
  });
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}
