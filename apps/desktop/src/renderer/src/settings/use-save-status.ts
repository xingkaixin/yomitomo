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
  const activeSaveRef = useRef<symbol | undefined>(undefined);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === undefined) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = undefined;
  }, []);

  const reset = useCallback(() => {
    activeSaveRef.current = undefined;
    clearIdleTimer();
    setSaveState('idle');
    setSaveError('');
  }, [clearIdleTimer]);

  const run = useCallback(
    async <TResult>(task: () => Promise<TResult>, options?: RunSaveOptions<TResult>) => {
      const request = Symbol();
      activeSaveRef.current = request;
      clearIdleTimer();
      setSaveState('saving');
      setSaveError('');
      try {
        const result = await task();
        if (activeSaveRef.current !== request) return undefined;
        const shouldMarkSaved = options?.onSaved?.(result) !== false;
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
        if (activeSaveRef.current !== request) return undefined;
        const message = errorMessage(error);
        options?.onError?.(error, message);
        setSaveError(message);
        setSaveState('error');
        return undefined;
      }
    },
    [clearIdleTimer, errorMessage, resetDelayMs],
  );

  useEffect(() => {
    return () => {
      activeSaveRef.current = undefined;
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  return useMemo(() => ({ reset, run, saveError, saveState }), [reset, run, saveError, saveState]);
}
