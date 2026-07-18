import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveState } from '../shell/app-types';

type SaveStatusOptions = {
  errorMessage: (error: unknown) => string;
  resetDelayMs?: number;
};

type RunSaveOptions<TResult> = {
  onError?: (error: unknown, message: string) => void;
  onSaved?: (result: TResult) => boolean | void;
};

export type SaveStatus = {
  reset: () => void;
  run: <TResult>(
    task: () => Promise<TResult>,
    options?: RunSaveOptions<TResult>,
  ) => Promise<TResult | undefined>;
  saveError: string;
  saveState: SaveState;
};

export function useSaveStatus({
  errorMessage,
  resetDelayMs = 1200,
}: SaveStatusOptions): SaveStatus {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const idleTimerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === undefined) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = undefined;
  }, []);

  const reset = useCallback(() => {
    clearIdleTimer();
    setSaveState('idle');
    setSaveError('');
  }, [clearIdleTimer]);

  const run = useCallback(
    async <TResult>(task: () => Promise<TResult>, options?: RunSaveOptions<TResult>) => {
      clearIdleTimer();
      setSaveState('saving');
      setSaveError('');
      try {
        const result = await task();
        const shouldMarkSaved = options?.onSaved?.(result) !== false;
        if (!mountedRef.current) return result;
        if (!shouldMarkSaved) {
          setSaveState('idle');
          return result;
        }
        setSaveState('saved');
        idleTimerRef.current = window.setTimeout(() => {
          setSaveState('idle');
          idleTimerRef.current = undefined;
        }, resetDelayMs);
        return result;
      } catch (error) {
        const message = errorMessage(error);
        options?.onError?.(error, message);
        if (mountedRef.current) {
          setSaveError(message);
          setSaveState('error');
        }
        return undefined;
      }
    },
    [clearIdleTimer, errorMessage, resetDelayMs],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  return useMemo(() => ({ reset, run, saveError, saveState }), [reset, run, saveError, saveState]);
}
