import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import type { SaveState } from '../shell/app-types';
import { idleSaveStatus, type SaveStatusState } from './settings-draft-saver';

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
  const [{ saveError, saveState }, setStatus] = useReducer(
    (_status: SaveStatusState, next: SaveStatusState) => next,
    idleSaveStatus,
  );
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
    setStatus(idleSaveStatus);
  }, [clearIdleTimer]);

  const run = useCallback(
    async <TResult>(task: () => Promise<TResult>, options?: RunSaveOptions<TResult>) => {
      const request = Symbol();
      activeSaveRef.current = request;
      clearIdleTimer();
      setStatus({ saveError: '', saveState: 'saving' });
      try {
        const result = await task();
        if (activeSaveRef.current !== request) return undefined;
        const shouldMarkSaved = options?.onSaved?.(result) !== false;
        if (!shouldMarkSaved) {
          setStatus(idleSaveStatus);
          return result;
        }
        setStatus({ saveError: '', saveState: 'saved' });
        idleTimerRef.current = window.setTimeout(() => {
          setStatus(idleSaveStatus);
          idleTimerRef.current = undefined;
        }, resetDelayMs);
        return result;
      } catch (error) {
        if (activeSaveRef.current !== request) return undefined;
        const message = errorMessage(error);
        options?.onError?.(error, message);
        setStatus({ saveError: message, saveState: 'error' });
        return undefined;
      }
    },
    [clearIdleTimer, errorMessage, resetDelayMs],
  );

  useMountEffect(() => () => {
    activeSaveRef.current = undefined;
    clearIdleTimer();
  });

  return useMemo(() => ({ reset, run, saveError, saveState }), [reset, run, saveError, saveState]);
}
