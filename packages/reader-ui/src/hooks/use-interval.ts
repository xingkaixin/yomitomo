import { useEffect, useEffectEvent } from 'react';

/** Runs callback every delay ms while mounted; a null delay stops the timer. */
export function useInterval(callback: () => void, delay: number | null) {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delay === null) return;
    const timer = window.setInterval(() => onTick(), delay);
    return () => window.clearInterval(timer);
  }, [delay]);
}
