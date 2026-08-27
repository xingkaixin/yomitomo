import { useCallback, useMemo, useRef } from 'react';
import type { SaveState } from '../shell/app-types';
import { useSaveStatus } from './use-save-status';

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
  const failedValueRef = useRef<{ value: TValue } | undefined>(undefined);
  const {
    reset: resetStatus,
    run,
    saveError,
    saveState,
  } = useSaveStatus({
    errorMessage,
    resetDelayMs,
  });

  const saveable = saveState !== 'saving' && canSave(value);

  const update = useCallback(
    (nextValue: TValue) => {
      failedValueRef.current = undefined;
      onChange(nextValue);
      resetStatus();
    },
    [onChange, resetStatus],
  );

  const save = useCallback(
    async (override?: TValue) => {
      const failedValue = failedValueRef.current;
      if (override === undefined && !failedValue && !saveable) return undefined;
      const nextValue = override ?? failedValue?.value ?? value;
      return run(() => persist(nextValue), {
        onError: () => {
          failedValueRef.current = { value: nextValue };
        },
        onSaved: (result) => {
          failedValueRef.current = undefined;
          return onSaved?.(result, nextValue);
        },
      });
    },
    [onSaved, persist, run, saveable, value],
  );

  return useMemo(
    () => ({
      canSave: saveable,
      reset: update,
      save,
      saveError,
      saveState,
      update,
      value,
    }),
    [save, saveError, saveState, saveable, update, value],
  );
}
