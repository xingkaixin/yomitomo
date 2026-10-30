import { useEffect, useEffectEvent } from 'react';

type EventListenerOptions = { capture?: boolean };

/** Listens on window or document while mounted; a null target removes the listener. */
export function useEventListener<K extends keyof WindowEventMap>(
  target: Window | null,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: EventListenerOptions,
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
  target: Document | null,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: EventListenerOptions,
): void;
export function useEventListener(
  target: Window | Document | null,
  type: string,
  handler: (event: Event) => void,
  options?: EventListenerOptions,
) {
  const onEvent = useEffectEvent(handler);
  const capture = options?.capture ?? false;

  useEffect(() => {
    if (!target) return;
    const listener = (event: Event) => onEvent(event);
    target.addEventListener(type, listener, capture);
    return () => target.removeEventListener(type, listener, capture);
  }, [capture, target, type]);
}
