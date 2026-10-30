import { useEffect, useEffectEvent } from 'react';

type Unsubscribe = () => void;

/**
 * Subscribes to a main-process push event while the view is mounted. Pass a stable preload
 * function such as `getDesktopApi().updates.onStatus`; a missing function skips the subscription.
 */
export function useDesktopEvent<TArgs extends unknown[]>(
  subscribe: ((listener: (...args: TArgs) => void) => Unsubscribe) | null | undefined,
  handler: (...args: TArgs) => void,
) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => subscribe?.((...args) => onEvent(...args)), [subscribe]);
}
