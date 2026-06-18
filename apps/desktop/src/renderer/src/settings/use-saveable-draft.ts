import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveState } from '../shell/app-types';

type UseSaveableDraftOptions<TValue, TResult> = {
  canSave: (value: TValue) => boolean;
  errorMessage: (error: unknown) => string;
  onChange: (value: TValue) => void;
  onSaved?: (result: TResult, value: TValue) => boolean | void;
  persist: (value: TValue) => Promise<TResult>;
  resetDelayMs?: number;
  value: TValue;
};

export type SaveableDraft<TValue, TResult = unknown> = {
  canSave: boolean;
  reset: (value: TValue) => void;
  save: (override?: TValue) => Promise<TResult | undefined>;
  saveError: string;
  saveState: SaveState;
  update: (value: TValue) => void;
  value: TValue;
};

export function useSaveableDraft<TValue, TResult = unknown>({
  canSave,
  errorMessage,
  onChange,
  onSaved,
  persist,
  resetDelayMs = 1200,
  value,
}: UseSaveableDraftOptions<TValue, TResult>): SaveableDraft<TValue, TResult> {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const idleTimerRef = useRef<number | undefined>(undefined);

  const saveable = saveState !== 'saving' && canSave(value);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === undefined) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = undefined;
  }, []);

  const update = useCallback(
    (nextValue: TValue) => {
      clearIdleTimer();
      onChange(nextValue);
      setSaveState('idle');
      setSaveError('');
    },
    [clearIdleTimer, onChange],
  );

  const reset = useCallback(
    (nextValue: TValue) => {
      clearIdleTimer();
      onChange(nextValue);
      setSaveState('idle');
      setSaveError('');
    },
    [clearIdleTimer, onChange],
  );

  const save = useCallback(
    async (override?: TValue) => {
      const nextValue = override ?? value;
      if (override === undefined && !saveable) return undefined;
      clearIdleTimer();
      setSaveState('saving');
      setSaveError('');
      try {
        const result = await persist(nextValue);
        const shouldMarkSaved = onSaved?.(result, nextValue) !== false;
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
        setSaveError(errorMessage(error));
        setSaveState('error');
        return undefined;
      }
    },
    [clearIdleTimer, errorMessage, onSaved, persist, resetDelayMs, saveable, value],
  );

  useEffect(() => () => clearIdleTimer(), [clearIdleTimer]);

  return useMemo(
    () => ({
      canSave: saveable,
      reset,
      save,
      saveError,
      saveState,
      update,
      value,
    }),
    [reset, save, saveError, saveState, saveable, update, value],
  );
}
