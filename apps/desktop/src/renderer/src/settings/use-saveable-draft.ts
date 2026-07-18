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
  const saveStatus = useSaveStatus({ errorMessage, resetDelayMs });

  const saveable = saveStatus.saveState !== 'saving' && canSave(value);

  const update = useCallback(
    (nextValue: TValue) => {
      failedValueRef.current = undefined;
      onChange(nextValue);
      saveStatus.reset();
    },
    [onChange, saveStatus],
  );

  const reset = useCallback(
    (nextValue: TValue) => {
      failedValueRef.current = undefined;
      onChange(nextValue);
      saveStatus.reset();
    },
    [onChange, saveStatus],
  );

  const save = useCallback(
    async (override?: TValue) => {
      const failedValue = failedValueRef.current;
      if (override === undefined && !failedValue && !saveable) return undefined;
      const nextValue = override ?? failedValue?.value ?? value;
      return saveStatus.run(() => persist(nextValue), {
        onError: () => {
          failedValueRef.current = { value: nextValue };
        },
        onSaved: (result) => {
          failedValueRef.current = undefined;
          return onSaved?.(result, nextValue);
        },
      });
    },
    [onSaved, persist, saveStatus, saveable, value],
  );

  return useMemo(
    () => ({
      canSave: saveable,
      reset,
      save,
      saveError: saveStatus.saveError,
      saveState: saveStatus.saveState,
      update,
      value,
    }),
    [reset, save, saveStatus.saveError, saveStatus.saveState, saveable, update, value],
  );
}
